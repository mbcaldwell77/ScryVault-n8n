const DATE_ONLY_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const dateOnlyMatch = DATE_ONLY_VALUE_PATTERN.exec(value);

  if (dateOnlyMatch) {
    const parsed = new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3]),
    );
    parsed.setHours(0, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateValue(value: string | null | undefined): string {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "—";
  }

  return parsed.toLocaleDateString();
}

export function isFutureDateValue(value: string | null | undefined): boolean {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return parsed.getTime() > today.getTime();
}
