/* Deterministic, synthetic answers for the non-live Sample reveal. Pure: this
   fixture inspects a question schema and is never part of a participant room. */
import {mulberry32} from '../assets/series.js';

export function sampleResponses(model){
  const rand = mulberry32(20260704);
  const names = ['Ana', 'Ben', 'Chika', 'Dev', 'Elle', 'Fin', 'Gus', 'Hana'];
  const shapes = model.questions.map(question => question.type === 'prob'
    ? {split: rand() < 0.4, a: 15 + rand() * 25, b: 60 + rand() * 30}
    : {base: Math.pow(10, 1 + Math.floor(rand() * 2)) * (0.5 + rand()),
      outlier: rand() < 0.5 ? Math.floor(rand() * names.length) : -1});

  return names.map((name, participant) => {
    const values = model.questions.map((question, index) => {
      const shape = shapes[index];
      if(question.type === 'prob'){
        const center = shape.split ? (participant % 2 ? shape.a : shape.b) : (shape.a + shape.b) / 2;
        return Math.max(2, Math.min(98, Math.round(center + (rand() - 0.5) * 18)));
      }
      if(question.type === 'chips'){
        const raw = question.options.map(() => 1 + Math.floor(rand() * 20));
        const total = raw.reduce((sum, value) => sum + value, 0);
        const allocated = raw.map(value => Math.floor(value * 100 / total));
        allocated[0] += 100 - allocated.reduce((sum, value) => sum + value, 0);
        return allocated;
      }
      const midpoint = shape.base * (participant === shape.outlier ? 2.6 : 0.9 + rand() * 0.2);
      const half = midpoint * (0.25 + rand() * 0.3);
      const rounded = value => Math.round(value * 10) / 10;
      return [rounded(midpoint - half), rounded(midpoint + half)];
    });
    return model.names ? {values, name} : {values};
  });
}
