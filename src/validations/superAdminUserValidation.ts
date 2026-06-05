import { z } from "zod";

export const createAdminUserSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address").min(1, "Email is required"),
    name: z.string().max(255).optional(),
    password: z.string().min(8, "Password must be at least 8 characters long"),
    companyId: z.string().min(1, "Company ID is required"),
    role: z.enum(["ADMIN", "AGENT"]).optional().default("ADMIN"),
    isActive: z.boolean().optional().default(true),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().max(255).optional(),
    email: z.string().email("Invalid email address").optional(),
    role: z.enum(["ADMIN", "AGENT"]).optional(),
    isActive: z.boolean().optional(),
    companyId: z.string().min(1).optional(),
  }),
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    newPassword: z.string().min(8, "Password must be at least 8 characters long"),
  }),
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  }),
});

export const getUserByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  }),
});

export const deleteUserSchema = z.object({
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  }),
});

export const activateUserSchema = z.object({
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  }),
});

export const deactivateUserSchema = z.object({
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  }),
});

