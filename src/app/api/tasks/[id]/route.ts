import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applyTransition, taskStatusSchema, type TaskStatus } from "@/lib/close";

const bodySchema = z.object({ to: taskStatusSchema });

/**
 * PATCH /api/tasks/:id  { to: TaskStatus }
 *
 * Advances a task's status through the validated state machine. Illegal
 * transitions are rejected with 422 — the engine is the single source of truth.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body. Expected { to: TaskStatus }." },
      { status: 400 },
    );
  }

  const task = await prisma.closeTask.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const from = task.status as TaskStatus;
  const to = parsed.data.to;

  try {
    applyTransition(from, to);
  } catch {
    return NextResponse.json(
      { error: `Invalid transition: ${from} → ${to}` },
      { status: 422 },
    );
  }

  const updated = await prisma.closeTask.update({
    where: { id },
    data: {
      status: to,
      // Stamp/clear completion so the burndown stays accurate.
      completedAt: to === "DONE" ? new Date() : null,
    },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
