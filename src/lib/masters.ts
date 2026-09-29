import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export interface Master {
  id: string;
  nama: string;
  kode?: string;
  supervisor_id?: string | null;
  area_id?: string | null;
}

export const getMasters = cache(async () => {
  const supabase = await createClient();
  const [c, a, t] = await Promise.all([
    supabase.from("classifications").select("id, kode, nama, aktif").order("nama"),
    supabase.from("areas").select("id, nama").order("nama"),
    supabase.from("teams").select("id, nama, supervisor_id, area_id").order("nama"),
  ]);
  const classifications = (c.data ?? []) as (Master & { aktif: boolean })[];
  const areas = (a.data ?? []) as Master[];
  const teams = (t.data ?? []) as Master[];
  const map = (xs: Master[]) => new Map(xs.map((x) => [x.id, x.nama]));
  return { classifications, areas, teams, cName: map(classifications), aName: map(areas), tName: map(teams) };
});
