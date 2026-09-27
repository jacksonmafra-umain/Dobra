import type { ModalKind, ModalPlacement } from '@dobra/core/engine/modal';

interface ModalProps {
  kind: ModalKind;
  placement: ModalPlacement;
  onClose: () => void;
}

export function Modal({ kind, placement, onClose }: ModalProps) {
  const area = placement.area;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className={`modal-area modal-area--${kind}`}
        style={{ left: area.x, top: area.y, width: area.width, height: area.height }}
      >
        {kind === 'alert' ? (
          <div className="modal-alert" role="alertdialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-alert__body">
              <strong>Remove Classic Burger Meal?</strong>
              <span>It will be removed from your bag.</span>
            </div>
            <div className="modal-alert__actions">
              <button onClick={onClose}>Cancel</button>
              <button className="modal-alert__destructive" onClick={onClose}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-sheet" role="dialog" data-name="🚧 sheet_v2" onClick={(e) => e.stopPropagation()}>
            <span className="modal-sheet__grabber" />
            <h2 className="t-H2">Customise your meal</h2>
            {['Medium fries', 'Cola Zero', 'Extra sauce'].map((option, i) => (
              <label className="modal-sheet__row t-Paragraph-Medium-Regular" key={option}>
                {option}
                <input type="checkbox" defaultChecked={i < 2} />
              </label>
            ))}
            <button className="floating_justified_large t-Button" data-name="floating_justified_large" onClick={onClose}>
              <span>Update</span>
              <span className="tnum">89 kr</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
