import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { type DrishtiRole } from "../../shared/drishti";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

const requireRoleSession = t.middleware(async ({ ctx, next }) => {
  if (!ctx.roleSession) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Select a Drishti role to continue." });
  }
  return next({ ctx: { ...ctx, roleSession: ctx.roleSession } });
});

export const roleProcedure = t.procedure.use(requireRoleSession);

export function withRoles(...roles: DrishtiRole[]) {
  return roleProcedure.use(
    t.middleware(async ({ ctx, next }) => {
      if (!ctx.roleSession || !roles.includes(ctx.roleSession.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This desk is not available for your role." });
      }
      return next({ ctx: { ...ctx, roleSession: ctx.roleSession } });
    }),
  );
}
