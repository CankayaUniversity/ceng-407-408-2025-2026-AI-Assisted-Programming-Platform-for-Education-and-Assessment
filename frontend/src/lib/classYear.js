/** Maps classYear integer to a human-readable label. */
export const YEAR_LABELS = {
  1: "1st Year",
  2: "2nd Year",
  3: "3rd Year",
  4: "4th Year",
  5: "Graduate",
};

/** Returns the label for a classYear value, or "—" if unknown. */
export function yearLabel(classYear) {
  return YEAR_LABELS[classYear] ?? "—";
}

/** All year filter options (for dropdowns / chip bars). */
export const YEAR_OPTIONS = [
  { value: 0,   label: "All Years" },
  { value: 1,   label: "1st Year"  },
  { value: 2,   label: "2nd Year"  },
  { value: 3,   label: "3rd Year"  },
  { value: 4,   label: "4th Year"  },
  { value: 5,   label: "Graduate"  },
];
