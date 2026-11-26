import { ResultEntryScreen } from '@/components/ResultEntry';

/** A player in the team sends the scores; the captain checks and saves them. */
export default function SendResult() {
  return <ResultEntryScreen mode="submit" />;
}
