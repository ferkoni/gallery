import { z } from 'zod';

// Every variable the app reads, checked at boot: a missing or empty value stops the app before it
// serves anything. Names match the ones Rails and .env.example use (operator contract).
export const envSchema = z.object({
  // Rails' secret_key_base: tokens signed with it are accepted by both backends.
  SECRET_KEY_BASE: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
