import { describe, expect, test } from 'bun:test';
import { gradeAsnafQuiz } from '../../src/education/asnaf-quiz';

const ALL_CORRECT = {
  'asnaf-count': '8',
  'fakir-miskin': 'definisi',
  gharim: 'gharim',
  muallaf: 'ya',
  amil: 'amil',
};

describe('@amwal/core/education/asnaf-quiz', () => {
  test('5/5 correct grades 100% and passed', () => {
    const grade = gradeAsnafQuiz(ALL_CORRECT);
    expect(grade).toEqual({
      correct: 5,
      total: 5,
      percentage: 100,
      passed: true,
    });
  });

  test('4/5 correct grades 80% and passed (boundary)', () => {
    const grade = gradeAsnafQuiz({ ...ALL_CORRECT, amil: 'riqab' });
    expect(grade.percentage).toBe(80);
    expect(grade.passed).toBe(true);
  });

  test('3/5 correct grades 60% and not passed', () => {
    const grade = gradeAsnafQuiz({
      ...ALL_CORRECT,
      amil: 'riqab',
      muallaf: 'tidak',
    });
    expect(grade.percentage).toBe(60);
    expect(grade.passed).toBe(false);
  });

  test('a missing question counts as wrong, not ungraded', () => {
    const partial = Object.fromEntries(
      Object.entries(ALL_CORRECT).filter(([id]) => id !== 'amil')
    );
    const grade = gradeAsnafQuiz(partial);
    expect(grade.correct).toBe(4);
    expect(grade.percentage).toBe(80);
  });

  test('unknown question ids in the payload are ignored', () => {
    const grade = gradeAsnafQuiz({ ...ALL_CORRECT, bogus: 'anything' });
    expect(grade.correct).toBe(5);
    expect(grade.percentage).toBe(100);
  });

  test('an empty submission grades 0% and not passed', () => {
    const grade = gradeAsnafQuiz({});
    expect(grade).toEqual({
      correct: 0,
      total: 5,
      percentage: 0,
      passed: false,
    });
  });

  test('a client cannot forge a passing score by sending wrong answers', () => {
    const grade = gradeAsnafQuiz({
      'asnaf-count': '999',
      'fakir-miskin': 'terbalik',
      gharim: 'riqab',
      muallaf: 'tidak',
      amil: 'ibnu-sabil',
    });
    expect(grade.percentage).toBe(0);
    expect(grade.passed).toBe(false);
  });
});
