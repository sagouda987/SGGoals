/** Rename only: keep IDs, timestamps, notes, completion and invested time intact. */
export function chessTaskText(text: string) {
  return /^(Study(?: for [14] hours?| 2 hour)?|Study Databricks\/Spark - 5 hours total|Study DSA \/ Databricks \/ Spark|dbt\/SQL study 4 hours \(today's topic\)|Chess study: 4 hours \(puzzles, games review, openings, endgames\))$/i.test(text) ? 'Chess' : text;
}
