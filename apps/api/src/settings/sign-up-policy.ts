/**
 * Who may sign in, decided from the stored settings: anyone while
 * registration is open, otherwise only an address on the list, whatever its
 * case. Pure, so it is tested without a database.
 */
export function permitsSignIn(
  settings: {
    readonly openRegistration: boolean;
    readonly allowedEmails: readonly string[];
  },
  email: string,
): boolean {
  return (
    settings.openRegistration || settings.allowedEmails.includes(email.toLowerCase())
  );
}
