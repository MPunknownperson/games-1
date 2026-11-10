#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <vector>

#include "ozz/animation/offline/raw_skeleton.h"
#include "ozz/animation/offline/skeleton_builder.h"
#include "ozz/animation/runtime/blending_job.h"
#include "ozz/animation/runtime/ik_two_bone_job.h"
#include "ozz/animation/runtime/local_to_model_job.h"
#include "ozz/animation/runtime/skeleton.h"
#include "ozz/base/containers/vector.h"
#include "ozz/base/maths/simd_quaternion.h"
#include "ozz/base/maths/soa_transform.h"
#include "ozz/base/span.h"

using ozz::animation::BlendingJob;
using ozz::animation::IKTwoBoneJob;
using ozz::animation::LocalToModelJob;
using ozz::animation::Skeleton;
using ozz::animation::offline::RawSkeleton;
using ozz::math::Float4x4;
using ozz::math::SimdFloat4;
using ozz::math::SimdQuaternion;
using ozz::math::SoaTransform;

struct OzzRig {
  ozz::unique_ptr<Skeleton> skeleton;
  std::vector<int> input_to_ozz;
  std::vector<int> ozz_to_input;
  ozz::vector<SoaTransform> base, upper, additive, output;
  ozz::vector<SimdFloat4> base_weights, upper_weights;
  ozz::vector<Float4x4> models;
};

static void build_joint(RawSkeleton::Joint& joint, int index, int count, const int* parents, const float* positions) {
  char name[16];
  std::snprintf(name, sizeof(name), "%d", index);
  joint.name = name;
  joint.transform.translation = ozz::math::Float3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
  for (int child = 0; child < count; ++child) if (parents[child] == index) {
    joint.children.resize(joint.children.size() + 1);
    build_joint(joint.children.back(), child, count, parents, positions);
  }
}

static bool update_models(OzzRig* rig) {
  LocalToModelJob job;
  job.skeleton = rig->skeleton.get();
  job.input = ozz::make_span(rig->output);
  job.output = ozz::make_span(rig->models);
  return job.Run();
}

static void export_pose(OzzRig* rig, float* quaternions, float* matrices) {
  for (int input = 0; input < static_cast<int>(rig->input_to_ozz.size()); ++input) {
    const int index = rig->input_to_ozz[input];
    SimdQuaternion rotations[4];
    ozz::math::Transpose4x4(&rig->output[index / 4].rotation.x, &rotations[0].xyzw);
    ozz::math::StorePtrU(rotations[index & 3].xyzw, quaternions + input * 4);
    for (int column = 0; column < 4; ++column) {
      ozz::math::StorePtrU(rig->models[index].cols[column], matrices + input * 16 + column * 4);
    }
  }
}

static void multiply_joint(OzzRig* rig, int index, const SimdQuaternion& correction) {
  auto& rotation = rig->output[index / 4].rotation;
  SimdQuaternion rotations[4];
  ozz::math::Transpose4x4(&rotation.x, &rotations[0].xyzw);
  rotations[index & 3] = rotations[index & 3] * correction;
  ozz::math::Transpose4x4(&rotations[0].xyzw, &rotation.x);
}

extern "C" {
OzzRig* ozz_create_rig(int count, const int* parents, const float* positions) {
  if (count < 1 || count > 128 || !parents || !positions) return nullptr;
  RawSkeleton raw;
  for (int index = 0; index < count; ++index) if (parents[index] == -1) {
    raw.roots.resize(raw.roots.size() + 1);
    build_joint(raw.roots.back(), index, count, parents, positions);
  }
  if (raw.num_joints() != count || !raw.Validate()) return nullptr;
  auto* rig = new OzzRig();
  rig->skeleton = ozz::animation::offline::SkeletonBuilder()(raw);
  if (!rig->skeleton) { delete rig; return nullptr; }
  rig->input_to_ozz.resize(count);
  rig->ozz_to_input.resize(count);
  for (int index = 0; index < count; ++index) {
    const int input = std::atoi(rig->skeleton->joint_names()[index]);
    rig->input_to_ozz[input] = index;
    rig->ozz_to_input[index] = input;
  }
  const int soa = rig->skeleton->num_soa_joints();
  rig->base.resize(soa); rig->upper.resize(soa); rig->additive.resize(soa); rig->output.resize(soa);
  rig->base_weights.resize(soa); rig->upper_weights.resize(soa); rig->models.resize(count);
  return rig;
}

void ozz_destroy_rig(OzzRig* rig) { delete rig; }

int ozz_blend_pose(OzzRig* rig, const float* base, const float* upper, const float* additive,
                   const float* mask, float upper_weight, float additive_weight, float hips_offset,
                   float* quaternions, float* matrices) {
  if (!rig || !base || !upper || !additive || !mask || !quaternions || !matrices) return 0;
  const int count = static_cast<int>(rig->input_to_ozz.size());
  const int soa = rig->skeleton->num_soa_joints();
  for (int block = 0; block < soa; ++block) {
    rig->base[block] = rig->skeleton->joint_rest_poses()[block];
    rig->upper[block] = rig->base[block];
    rig->additive[block] = SoaTransform::identity();
    float b[4][4] = {}, u[4][4] = {}, a[4][4] = {}, bw[4] = {}, uw[4] = {};
    for (int lane = 0; lane < 4; ++lane) {
      const int index = block * 4 + lane;
      if (index >= count) { b[lane][3] = u[lane][3] = a[lane][3] = 1; bw[lane] = 1; continue; }
      const int input = rig->ozz_to_input[index];
      for (int component = 0; component < 4; ++component) {
        b[lane][component] = base[input * 4 + component];
        u[lane][component] = upper[input * 4 + component];
        a[lane][component] = additive[input * 4 + component];
      }
      uw[lane] = std::max(0.f, std::min(1.f, mask[input] * upper_weight));
      bw[lane] = 1.f - uw[lane];
    }
    auto fill = [](ozz::math::SoaQuaternion& rotation, float values[4][4]) {
      rotation.x = ozz::math::simd_float4::Load(values[0][0], values[1][0], values[2][0], values[3][0]);
      rotation.y = ozz::math::simd_float4::Load(values[0][1], values[1][1], values[2][1], values[3][1]);
      rotation.z = ozz::math::simd_float4::Load(values[0][2], values[1][2], values[2][2], values[3][2]);
      rotation.w = ozz::math::simd_float4::Load(values[0][3], values[1][3], values[2][3], values[3][3]);
    };
    fill(rig->base[block].rotation, b); fill(rig->upper[block].rotation, u); fill(rig->additive[block].rotation, a);
    rig->base_weights[block] = ozz::math::simd_float4::Load(bw[0], bw[1], bw[2], bw[3]);
    rig->upper_weights[block] = ozz::math::simd_float4::Load(uw[0], uw[1], uw[2], uw[3]);
  }
  const int root = rig->input_to_ozz[0];
  float root_y[4];
  ozz::math::StorePtrU(rig->base[root / 4].translation.y, root_y);
  root_y[root & 3] += hips_offset;
  rig->base[root / 4].translation.y = ozz::math::simd_float4::LoadPtrU(root_y);
  rig->upper[root / 4].translation.y = rig->base[root / 4].translation.y;
  BlendingJob::Layer layers[2], additive_layer[1];
  layers[0].weight = 1; layers[0].transform = ozz::make_span(rig->base); layers[0].joint_weights = ozz::make_span(rig->base_weights);
  layers[1].weight = 1; layers[1].transform = ozz::make_span(rig->upper); layers[1].joint_weights = ozz::make_span(rig->upper_weights);
  additive_layer[0].weight = std::max(0.f, additive_weight); additive_layer[0].transform = ozz::make_span(rig->additive);
  BlendingJob job;
  job.layers = ozz::make_span(layers); job.additive_layers = ozz::make_span(additive_layer);
  job.rest_pose = rig->skeleton->joint_rest_poses(); job.output = ozz::make_span(rig->output);
  if (!job.Run() || !update_models(rig)) return 0;
  export_pose(rig, quaternions, matrices);
  return 1;
}

int ozz_solve_leg(OzzRig* rig, int start, int middle, int end, const float* target, float weight,
                  float* quaternions, float* matrices) {
  if (!rig || !target || start < 0 || middle < 0 || end < 0 || start >= static_cast<int>(rig->input_to_ozz.size())
      || middle >= static_cast<int>(rig->input_to_ozz.size()) || end >= static_cast<int>(rig->input_to_ozz.size())) return 0;
  const int start_index = rig->input_to_ozz[start], middle_index = rig->input_to_ozz[middle], end_index = rig->input_to_ozz[end];
  SimdQuaternion start_correction, middle_correction;
  IKTwoBoneJob job;
  job.start_joint = &rig->models[start_index]; job.mid_joint = &rig->models[middle_index]; job.end_joint = &rig->models[end_index];
  job.target = ozz::math::simd_float4::Load(target[0], target[1], target[2], 1);
  job.mid_axis = ozz::math::simd_float4::x_axis(); job.pole_vector = ozz::math::simd_float4::z_axis();
  job.weight = std::max(0.f, std::min(1.f, weight)); job.soften = 0.97f;
  job.start_joint_correction = &start_correction; job.mid_joint_correction = &middle_correction;
  if (!job.Run()) return 0;
  multiply_joint(rig, start_index, start_correction); multiply_joint(rig, middle_index, middle_correction);
  if (!update_models(rig)) return 0;
  export_pose(rig, quaternions, matrices);
  return 1;
}

int ozz_rotate_joint(OzzRig* rig, int joint, const float* rotation, float* quaternions, float* matrices) {
  if (!rig || !rotation || joint < 0 || joint >= static_cast<int>(rig->input_to_ozz.size())) return 0;
  SimdQuaternion correction;
  correction.xyzw = ozz::math::simd_float4::LoadPtrU(rotation);
  multiply_joint(rig, rig->input_to_ozz[joint], correction);
  if (!update_models(rig)) return 0;
  export_pose(rig, quaternions, matrices);
  return 1;
}
}