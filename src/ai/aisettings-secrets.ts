export type SecretOps = {
  get(id: string): Promise<string | null>;
  set(id: string, secret: string): Promise<void>;
  delete(id: string): Promise<void>;
};

export async function moveLegacySecret(
  oldId: string,
  newId: string,
  legacySecret: string,
  ops: SecretOps,
): Promise<void> {
  const previous = await ops.get(oldId);
  const secret = previous || legacySecret;
  if (!secret) throw new Error("Legacy key is unavailable");
  await ops.set(newId, secret);
  if (oldId !== newId) await ops.delete(oldId);
}
