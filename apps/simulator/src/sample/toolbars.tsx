import type { ToolbarItemSpec, ToolbarSpec } from '@dobra/core/config/types';
import { asset } from './assets';
import { Icon } from './icons';
import { MymLogo } from './illustrations';

interface ToolbarProps {
  spec: ToolbarSpec;
  items: ToolbarItemSpec[];
  /** Items with a text label that the HIG keeps out of the vertical toolbar. */
  flagged?: string[];
}

const TEXT_IN_BAR_HINT = 'Text label: stays in a horizontal bar on iPhone Duo (HIG)';

export function AppToolbar({ spec, items, flagged = [] }: ToolbarProps) {
  const qr = items.find((i) => i.id === 'qr');
  const points = items.find((i) => i.id === 'points');
  return (
    <header className="app_toolbar" data-name="app_toolbar">
      <div className="app_toolbar__content">
        {spec.logo === 'member_logo_light_default' ? (
          <MymLogo />
        ) : (
          <img className="app_toolbar__logo" src={asset('ImSampleLogo.svg')} alt="Sample Store" />
        )}
        {points && (
          <button
            className="label_with_chevron t-Paragraph-Medium-Bold tnum"
            data-name="LabelWithChevron"
            data-label={points.label}
            data-hig-flag={flagged.includes(points.id) || undefined}
            title={flagged.includes(points.id) ? TEXT_IN_BAR_HINT : undefined}
          >
            {points.title}
            <img src={asset('IcChevronRight.svg')} alt="" />
          </button>
        )}
      </div>
      {qr && (
        <button className="app_toolbar__center" aria-label={qr.title} data-name="ic_qr_code_default_32">
          <img src={asset('IcQrCodeDefault32.svg')} alt="" width={32} height={32} />
        </button>
      )}
    </header>
  );
}

export function Toolbar({ spec, items, flagged = [] }: ToolbarProps) {
  const leading = items.filter((i) => i.group === 'navigation');
  const trailing = items.filter((i) => i.group !== 'navigation');
  return (
    <header className="toolbar" data-name="toolbar" data-type={spec.type}>
      <div className="toolbar__side">
        {leading.map((i) => (
          <ToolbarItem item={i} flagged={flagged.includes(i.id)} key={i.id} />
        ))}
      </div>
      {spec.title && <h1 className="toolbar__title t-H3">{spec.title}</h1>}
      <div className="toolbar__side toolbar__side--end">
        {trailing.map((i) => (
          <ToolbarItem item={i} flagged={flagged.includes(i.id)} key={i.id} />
        ))}
      </div>
    </header>
  );
}

function ToolbarItem({ item, flagged }: { item: ToolbarItemSpec; flagged: boolean }) {
  return item.label === 'text' || !item.symbol ? (
    <button
      className="toolbar__text t-Paragraph-Medium-Bold tnum"
      data-label="text"
      data-hig-flag={flagged || undefined}
      title={flagged ? TEXT_IN_BAR_HINT : undefined}
    >
      {item.title}
    </button>
  ) : (
    <button className="toolbar__icon" aria-label={item.title} data-label={item.label}>
      <Icon name={item.symbol} />
    </button>
  );
}
