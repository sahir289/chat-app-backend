export function getLeadVisitorName(lead?: { fullName?: string | null } | null): string | null {
  const firstName = lead?.fullName?.trim().split(/\s+/)[0];
  return firstName || null;
}

export function getVisitorFirstName(fullName?: string | null): string | null {
  const firstName = fullName?.trim().split(/\s+/)[0];
  return firstName || null;
}
