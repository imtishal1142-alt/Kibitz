import { CLASS_LABEL, CLASS_MEANING } from '../lib/chess/classify';
import type { MoveClass } from '../lib/types';
import { GradeIcon } from './GradeIcon';

export function ClassBadge({ cls, short }: { cls: MoveClass; short?: boolean }) {
  return (
    <span className={`badge badge-${cls}`} title={CLASS_MEANING[cls]}>
      <GradeIcon cls={cls} size={short ? 16 : 18} />
      {short ? <span className="sr-only">{CLASS_LABEL[cls]}</span> : CLASS_LABEL[cls]}
    </span>
  );
}
