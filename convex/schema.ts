import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const workspaceCollections = ["leads", "projects", "management", "postSaleOperations"] as const;

export default defineSchema({
  workspaceRecords: defineTable({
    collection: v.union(
      v.literal("leads"),
      v.literal("projects"),
      v.literal("management"),
      v.literal("postSaleOperations"),
    ),
    recordId: v.string(),
    order: v.number(),
    data: v.any(),
    updatedAt: v.number(),
  }).index("by_collection_order", ["collection", "order"])
    .index("by_collection_record", ["collection", "recordId"]),
});
