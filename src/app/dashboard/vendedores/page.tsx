"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  RefreshCw,
  UserRound,
  Percent,
  Trash2,
  Edit,
} from "lucide-react";
import { toast } from "sonner";

interface Seller {
  id: string;
  profile_id: string | null;
  full_name: string;
  phone: string | null;
  cpf_cnpj: string | null;
  notes: string | null;
  is_active: boolean;
}

interface Tier {
  id: string;
  seller_id: string | null;
  min_amount: number;
  max_amount: number | null;
  percent: number;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskPhoneBR(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const emptyForm = {
  full_name: "",
  phone: "",
  cpf_cnpj: "",
  notes: "",
  is_active: true,
  profile_id: "",
};

export default function VendedoresPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Seller | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  // Faixas de comissão
  const [tierSellerId, setTierSellerId] = useState<string>("default");
  const [isTiersOpen, setIsTiersOpen] = useState(false);
  const [tMin, setTMin] = useState("0");
  const [tMax, setTMax] = useState("");
  const [tPct, setTPct] = useState("");
  const [isSavingTier, setIsSavingTier] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sRes, tRes, pRes] = await Promise.all([
        supabase.from("sellers").select("*").order("full_name"),
        supabase.from("commission_tiers").select("*").order("min_amount"),
        supabase.from("profiles").select("id, full_name").order("full_name"),
      ]);
      setSellers((sRes.data as Seller[]) || []);
      setTiers((tRes.data as Tier[]) || []);
      setProfiles((pRes.data as { id: string; full_name: string }[]) || []);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  }

  function openEdit(s: Seller) {
    setEditing(s);
    setForm({
      full_name: s.full_name,
      phone: maskPhoneBR(s.phone || ""),
      cpf_cnpj: s.cpf_cnpj || "",
      notes: s.notes || "",
      is_active: s.is_active,
      profile_id: s.profile_id || "",
    });
    setIsDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("Informe o nome do vendedor.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim().toUpperCase(),
        phone: form.phone || null,
        cpf_cnpj: form.cpf_cnpj || null,
        notes: form.notes || null,
        is_active: form.is_active,
        profile_id: form.profile_id || null,
      };
      const { error } = editing
        ? await supabase.from("sellers").update(payload).eq("id", editing.id)
        : await supabase.from("sellers").insert(payload);
      if (error) throw error;
      toast.success(editing ? "Vendedor atualizado!" : "Vendedor cadastrado!");
      setIsDialogOpen(false);
      load();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro ao salvar", { description: msg });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(s: Seller) {
    if (!confirm(`Excluir o vendedor ${s.full_name}?`)) return;
    const { error } = await supabase.from("sellers").delete().eq("id", s.id);
    if (error) {
      toast.error("Não foi possível excluir", {
        description: "Vendedores com kits registrados não podem ser excluídos.",
      });
      return;
    }
    toast.success("Vendedor excluído.");
    load();
  }

  async function handleAddTier(e: React.FormEvent) {
    e.preventDefault();
    const min = parseFloat(tMin) || 0;
    const max = tMax.trim() === "" ? null : parseFloat(tMax);
    const pct = parseFloat(tPct);
    if (isNaN(pct) || pct <= 0) {
      toast.error("Informe o percentual da faixa.");
      return;
    }
    if (max !== null && max <= min) {
      toast.error("O valor final deve ser maior que o inicial.");
      return;
    }
    setIsSavingTier(true);
    try {
      const { error } = await supabase.from("commission_tiers").insert({
        seller_id: tierSellerId === "default" ? null : tierSellerId,
        min_amount: min,
        max_amount: max,
        percent: pct,
      });
      if (error) throw error;
      setTMin(max !== null ? String(max + 0.01) : "0");
      setTMax("");
      setTPct("");
      toast.success("Faixa adicionada!");
      load();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro ao adicionar faixa", { description: msg });
    } finally {
      setIsSavingTier(false);
    }
  }

  async function handleDeleteTier(id: string) {
    const { error } = await supabase.from("commission_tiers").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir faixa");
      return;
    }
    load();
  }

  const shownTiers = tiers.filter((t) =>
    tierSellerId === "default" ? t.seller_id === null : t.seller_id === tierSellerId
  );

  if (!isAdmin) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <UserRound className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Apenas administradores acessam esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <UserRound className="h-7 w-7 text-indigo-600" />
            Vendedores
          </h1>
          <p className="mt-1 text-muted-foreground">
            Cadastre os vendedores de consignado e configure as faixas de comissão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsTiersOpen(true)}>
            <Percent className="mr-2 h-4 w-4" />
            Comissões
          </Button>
          <Button
            size="sm"
            onClick={openNew}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Vendedor
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-60 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : sellers.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <UserRound className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="font-semibold">Nenhum vendedor cadastrado</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cadastre um vendedor para começar a montar kits de consignado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.map((s) => {
            const own = tiers.filter((t) => t.seller_id === s.id).length;
            return (
              <Card key={s.id} className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.phone || "Sem telefone"}
                      </p>
                    </div>
                    {!s.is_active && (
                      <Badge variant="secondary" className="text-[10px]">
                        Inativo
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge
                      variant="secondary"
                      className={
                        s.profile_id
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "text-muted-foreground"
                      }
                    >
                      {s.profile_id ? "Acessa o app" : "Sem acesso"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {own > 0 ? `${own} faixa(s) própria(s)` : "Comissão padrão"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(s)}
                      className="h-8 flex-1 text-xs"
                    >
                      <Edit className="mr-1.5 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTierSellerId(s.id);
                        setIsTiersOpen(true);
                      }}
                      className="h-8 flex-1 text-xs"
                    >
                      <Percent className="mr-1.5 h-3.5 w-3.5" />
                      Comissão
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(s)}
                      className="h-8 w-8 text-rose-500 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cadastro/edição */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-md flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? "Editar Vendedor" : "Novo Vendedor"}</DialogTitle>
            <DialogDescription>
              Dados do vendedor de consignado. Vincule a um usuário para ele acessar o app.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto py-1 pr-1">
              <div className="space-y-1.5">
                <Label htmlFor="v-name">Nome Completo *</Label>
                <Input
                  id="v-name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-phone">Telefone</Label>
                <Input
                  id="v-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: maskPhoneBR(e.target.value) })}
                  placeholder="(41) 99999-9999"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-cpf">CPF / CNPJ</Label>
                <Input
                  id="v-cpf"
                  value={form.cpf_cnpj}
                  onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Usuário do app (acesso)</Label>
                <Select
                  value={form.profile_id || "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, profile_id: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem acesso ao app" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem acesso ao app</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  O usuário precisa se cadastrar no app antes de aparecer aqui.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-notes">Observações</Label>
                <Textarea
                  id="v-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="h-20"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="v-active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                <Label htmlFor="v-active" className="cursor-pointer font-normal">
                  Vendedor ativo
                </Label>
              </div>
            </div>
            <DialogFooter className="mt-3 shrink-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Faixas de comissão */}
      <Dialog open={isTiersOpen} onOpenChange={setIsTiersOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Faixas de Comissão</DialogTitle>
            <DialogDescription>
              Defina o percentual por faixa de valor vendido. Ex: até R$ 500 = 30%, de R$
              500,01 a R$ 1.000 = 35%.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Aplicar a</Label>
              <Select value={tierSellerId} onValueChange={setTierSellerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Padrão (todos os vendedores)</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tierSellerId !== "default" && (
                <p className="text-[10px] text-muted-foreground">
                  Faixas próprias substituem o padrão para este vendedor.
                </p>
              )}
            </div>

            <form onSubmit={handleAddTier} className="grid grid-cols-4 items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">De (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tMin}
                  onChange={(e) => setTMin(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="sem teto"
                  value={tMax}
                  onChange={(e) => setTMax(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">%</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={tPct}
                  onChange={(e) => setTPct(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={isSavingTier} className="h-10">
                {isSavingTier ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </form>

            <div className="space-y-1.5">
              {shownTiers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma faixa cadastrada.
                </p>
              ) : (
                shownTiers.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border p-2.5"
                  >
                    <span className="text-sm">
                      {brl(Number(t.min_amount))} —{" "}
                      {t.max_amount === null ? "sem teto" : brl(Number(t.max_amount))}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-indigo-600 text-white">
                        {Number(t.percent)}%
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteTier(t.id)}
                        className="h-7 w-7 text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="mt-3 shrink-0 border-t pt-3">
            <Button variant="outline" onClick={() => setIsTiersOpen(false)} className="w-full">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
