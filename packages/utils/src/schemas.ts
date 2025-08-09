import { z } from 'zod';

// User schemas
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['user', 'admin', 'referee']),
});

export type User = z.infer<typeof userSchema>; 