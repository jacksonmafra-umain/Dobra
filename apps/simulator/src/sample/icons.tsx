import { asset } from './assets';

/** Sample icon names that have a Figma export. */
const ICON_FILES: Record<string, string> = {
  ic_arrow_right_default_32: 'ic_arrow_right_default_32.svg',
  ic_qr_code_default_32: 'IcQrCodeDefault32.svg',
  ic_information_default_32: 'ic_information_default_32.svg',
  ic_deal_timeout_16: 'ic_deal_timeout_16.svg',
  ic_reward_locked_16: 'ic_reward_locked_16.svg',
  ic_location_default_32: 'ic_location_default_32.svg',
  ic_chevron_right: 'IcChevronRight.svg',
  ic_link_arrow: 'IcLinkArrow.svg',
};

/** Stand-ins for icons that are not exported from Figma yet. Marked with data-missing-icon. */
const FALLBACK_ICON_PATHS: Record<string, string> = {
  ic_close_default_32: 'M7 7l10 10M17 7L7 17',
  ic_refresh_default_32: 'M18.5 12a6.5 6.5 0 1 1-1.9-4.6M18.5 5.5v3.5H15',
  ic_plus_default_32: 'M12 6v12M6 12h12',
  ic_minus_default_32: 'M6 12h12',
  ic_edit_default_32: 'M5 19h4L19 9l-4-4L5 15v4Z',
  ic_ellipsis_default_32: 'M6 12h.01M12 12h.01M18 12h.01',
  ic_search_default_32: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20',
  ic_heart_default_32: 'M12 19s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.8C19 14.6 12 19 12 19Z',
  ic_menu_default_32: 'M5 7h14M5 12h14M5 17h14',
};

interface IconProps {
  name: string;
  size?: number;
}

export function Icon({ name, size = 24 }: IconProps) {
  if (name === 'ic_chevron_left_default_32') {
    return (
      <img
        src={asset('IcChevronRight.svg')}
        alt=""
        width={size}
        height={size}
        data-missing-icon={name}
        className="sample-icon sample-icon--flip"
      />
    );
  }
  const file = ICON_FILES[name];
  return file ? (
    <img src={asset(file)} alt="" width={size} height={size} className="sample-icon" />
  ) : (
    <FallbackIcon name={name} size={size} />
  );
}

export function FallbackIcon({ name, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'ic_ellipsis_default_32' ? 3 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-missing-icon={name}
    >
      <path d={FALLBACK_ICON_PATHS[name] ?? 'M8 8h8v8H8z'} />
    </svg>
  );
}
