import { beforeEach, describe, expect, it } from 'vitest';
import { useFretStore } from '../useFretStore';
import type { CustomStep } from '../../theory/progressions';

const A: CustomStep[] = [
  { rootPc: 0, typeId: 'maj' },
  { rootPc: 7, typeId: 'maj' },
];
const B: CustomStep[] = [
  { rootPc: 9, typeId: 'm7' },
  { rootPc: 5, typeId: 'maj' },
  { rootPc: 0, typeId: 'maj' },
];

const state = () => useFretStore.getState();

// store 是模块级单例，用例之间必须把「我的进行」相关字段清干净
beforeEach(() => {
  useFretStore.setState({
    savedProgressions: [],
    savedProgressionId: null,
    customSteps: null,
    customName: null,
    progressionOverrides: {},
    progressionVoicings: {},
    progressionId: 'pop1564',
  });
});

describe('保存 / 覆盖「我的进行」', () => {
  it('新建保存会追加条目并记住来源 id', () => {
    const res = state().saveProgression('进行 A', A);
    expect(res).toEqual({ id: expect.any(String), name: '进行 A', overwritten: false });

    const after = state();
    expect(after.savedProgressions).toHaveLength(1);
    expect(after.savedProgressions[0].id).toBe(res!.id);
    expect(after.savedProgressions[0].steps).toEqual(A);
    expect(after.savedProgressionId).toBe(res!.id);
    expect(after.customName).toBe('进行 A');
  });

  it('覆盖原条目只更新内容，不新增，也不换 id / createdAt', () => {
    const first = state().saveProgression('进行 A', A)!;
    const createdAt = state().savedProgressions[0].createdAt;

    // 模拟用户改了和弦和播放把位后再保存
    useFretStore.setState({ progressionVoicings: { 1: 2 } });
    const second = state().saveProgression('进行 A', B, first.id);

    expect(second).toEqual({ id: first.id, name: '进行 A', overwritten: true });
    const list = state().savedProgressions;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: first.id,
      name: '进行 A',
      steps: B,
      voicings: { 1: 2 },
      createdAt,
    });
    expect(state().savedProgressionId).toBe(first.id);
  });

  it('覆盖时可以一起改名', () => {
    const first = state().saveProgression('旧名字', A)!;
    state().saveProgression('新名字', B, first.id);
    expect(state().savedProgressions[0].name).toBe('新名字');
    expect(state().customName).toBe('新名字');
  });

  it('传了不存在的 id 时退回新建，不丢这次保存', () => {
    const res = state().saveProgression('进行 A', A, 'saved-not-exist');
    expect(res?.overwritten).toBe(false);
    expect(state().savedProgressions).toHaveLength(1);
    expect(state().savedProgressionId).toBe(res!.id);
  });

  it('空名字会生成默认名，并按实际写入的名字返回', () => {
    const res = state().saveProgression('   ', A);
    expect(res?.name).toMatch(/^我的进行 /);
    expect(state().savedProgressions[0].name).toBe(res!.name);
  });

  it('没有和弦时返回 null，也不会新增条目', () => {
    expect(state().saveProgression('空的', [])).toBeNull();
    expect(state().savedProgressions).toHaveLength(0);
  });
});

describe('编辑来源条目的维护', () => {
  it('载入已保存进行时记录来源 id 和内容', () => {
    const first = state().saveProgression('进行 A', A)!;
    state().chooseProgression('pop1564');
    expect(state().savedProgressionId).toBeNull();

    state().loadSavedProgression(first.id);
    const after = state();
    expect(after.savedProgressionId).toBe(first.id);
    expect(after.customSteps).toEqual(A);
    expect(after.customName).toBe('进行 A');
    expect(after.progressionId).toBeNull();
  });

  it('换用库里的进行或开始自建时清空来源 id', () => {
    const first = state().saveProgression('进行 A', A)!;
    expect(state().savedProgressionId).toBe(first.id);

    state().chooseProgression('pop1564');
    expect(state().savedProgressionId).toBeNull();

    state().loadSavedProgression(first.id);
    state().beginCustom(B);
    expect(state().savedProgressionId).toBeNull();
  });

  it('删掉正在编辑的条目只清来源 id，指板上的内容还在', () => {
    const first = state().saveProgression('进行 A', A)!;
    state().deleteSavedProgression(first.id);

    const after = state();
    expect(after.savedProgressions).toHaveLength(0);
    expect(after.savedProgressionId).toBeNull();
    // 删除的是库条目，不是用户当前搭的进行
    expect(after.customName).toBe('进行 A');
  });

  it('删别的条目不会动当前来源 id', () => {
    const a = state().saveProgression('进行 A', A)!;
    const b = state().saveProgression('进行 B', B)!;
    // 保存 B 之后来源指向 B
    expect(state().savedProgressionId).toBe(b.id);

    state().deleteSavedProgression(a.id);
    expect(state().savedProgressionId).toBe(b.id);
  });
});
