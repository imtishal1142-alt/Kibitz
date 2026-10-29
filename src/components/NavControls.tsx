import { Icon } from './Icon';

export function NavControls({ onFirst, onPrev, onNext, onLast, onFlip, canPrev, canNext }: { onFirst: () => void; onPrev: () => void; onNext: () => void; onLast: () => void; onFlip?: () => void; canPrev: boolean; canNext: boolean }) {
  return (
    <div className="controls" role="group" aria-label="Move navigation">
      <button type="button" className="btn btn-icon" onClick={onFirst} disabled={!canPrev} aria-label="First position" title="First position (Home)">
        <Icon name="first" />
      </button>
      <button type="button" className="btn btn-icon" onClick={onPrev} disabled={!canPrev} aria-label="Previous move" title="Previous move (Left arrow)">
        <Icon name="left" />
      </button>
      <button type="button" className="btn btn-icon" onClick={onNext} disabled={!canNext} aria-label="Next move" title="Next move (Right arrow)">
        <Icon name="right" />
      </button>
      <button type="button" className="btn btn-icon" onClick={onLast} disabled={!canNext} aria-label="Last position" title="Last position (End)">
        <Icon name="last" />
      </button>
      {onFlip ? (
        <button type="button" className="btn btn-icon" onClick={onFlip} aria-label="Flip the board" title="Flip the board (F)">
          <Icon name="flip" />
        </button>
      ) : null}
    </div>
  );
}
