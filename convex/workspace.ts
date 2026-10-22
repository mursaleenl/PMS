import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const collectionValidator = v.union(
  v.literal("leads"),
  v.literal("projects"),
  v.literal("management"),
  v.literal("postSaleOperations"),
);

const collections = ["leads", "projects", "management", "postSaleOperations"] as const;

async function requireEmployee(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in is required to access the VRKSpace workspace.");
}

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    await requireEmployee(ctx);
    const records = await Promise.all(collections.map((collection) =>
      ctx.db.query("workspaceRecords").withIndex("by_collection_order", (q) => q.eq("collection", collection)).collect(),
    ));
    return records.flat();
  },
});

export const replaceCollection = mutation({
  args: {
    collection: collectionValidator,
    records: v.array(v.object({ recordId: v.string(), order: v.number(), data: v.any() })),
  },
  handler: async (ctx, { collection, records: incoming }) => {
    await requireEmployee(ctx);
    const existing = await ctx.db.query("workspaceRecords")
      .withIndex("by_collection_order", (q) => q.eq("collection", collection)).collect();
    const incomingIds = new Set(incoming.map(({ recordId }) => recordId));
    for (const record of existing) {
      if (!incomingIds.has(record.recordId)) await ctx.db.delete(record._id);
    }
    for (const record of incoming) {
      const current = existing.find((item) => item.recordId === record.recordId);
      if (current) {
        await ctx.db.patch(current._id, { ...record, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("workspaceRecords", { collection, ...record, updatedAt: Date.now() });
      }
    }
  },
});
