import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [patients, users] = await Promise.all([
    prisma.patient.findMany({ select: { id: true, name: true, status: true }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, title: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({
    patients,
    therapists: users.filter((u) => u.role === "therapist").map(({ id, name, title }) => ({ id, name, title })),
    directors: users.filter((u) => u.role === "director").map(({ id, name, title }) => ({ id, name, title })),
  });
}