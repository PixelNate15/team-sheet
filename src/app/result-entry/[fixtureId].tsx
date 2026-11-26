import { ResultEntryScreen } from '@/components/ResultEntry';

/** Captain enters or edits a result (port of captain_add_or_edit_result.py), saved in one transaction. */
export default function ResultEntry() {
  return <ResultEntryScreen mode="save" />;
}
