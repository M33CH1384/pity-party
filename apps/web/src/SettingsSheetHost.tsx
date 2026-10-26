import MoreOptions from './MoreOptions';
import { closeSettingsSheet, useSettingsSheet } from './settingsSheet';

/** Renders the ONE Settings sheet while a request is open (see settingsSheet.ts). */
export default function SettingsSheetHost() {
  const sheet = useSettingsSheet();
  if (!sheet.open) return null;
  return <MoreOptions initialSection={sheet.section === 'sound' ? 'sound' : undefined} anchorSeq={sheet.seq} onClose={closeSettingsSheet} />;
}
