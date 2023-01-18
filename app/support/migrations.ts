import { literal as qLiteral } from 'pg-format';

export function eventTypesSQLs(...types: string[]): [string, string] {
  const qTypes = types.map((t) => qLiteral(t));
  return [
    // Up
    `insert into event_types (event_type) values ${qTypes.map((t) => `(${t})`).join(',')};`,
    // Down
    [
      `delete from events where event_type in (${qTypes.join(',')});`,
      `delete from event_types where event_type in (${qTypes.join(',')});`,
    ].join('\n'),
  ];
}
