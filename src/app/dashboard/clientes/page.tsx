"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
  TrendingDown,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  DollarSign,
  ChevronRight,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

// Máscara de telefone BR: (41) 99179-3307 (11 díg.) ou (41) 9179-3307 (10 díg.)
function maskPhoneBR(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function ClientesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const supabase = createClient();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [showValues, setShowValues] = useState(true);
  const money = (v: number) =>
    showValues ? `R$ ${v.toFixed(2)}` : "R$ ••••";

  // Grupos de clientes
  interface Group {
    id: string;
    name: string;
    color: string;
  }
  const [groups, setGroups] = useState<Group[]>([]);
  const [isGroupsOpen, setIsGroupsOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#6366f1");
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  const emptyForm = {
    full_name: "",
    email: "",
    phone: "",
    cpf_cnpj: "",
    address_street: "",
    address_number: "",
    address_complement: "",
    address_neighborhood: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    credit_limit: "0",
    notes: "",
    is_active: true,
    group_id: "",
  };

  // Customer Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Data
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const [custRes, grpRes] = await Promise.all([
        supabase.from("customers").select("*").order("full_name"),
        supabase.from("customer_groups").select("id, name, color").order("name"),
      ]);

      if (custRes.error) throw custRes.error;
      setCustomers(custRes.data || []);
      setGroups((grpRes.data as Group[]) || []);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao buscar clientes", {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) {
      toast.error("Informe o nome do grupo.");
      return;
    }
    setIsSavingGroup(true);
    try {
      const { error } = await supabase
        .from("customer_groups")
        .insert({ name: newGroupName.trim(), color: newGroupColor });
      if (error) throw error;
      setNewGroupName("");
      setNewGroupColor("#6366f1");
      toast.success("Grupo criado!");
      fetchCustomers();
    } catch (error: any) {
      toast.error("Erro ao criar grupo", { description: error.message });
    } finally {
      setIsSavingGroup(false);
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("Excluir este grupo? Os clientes ligados a ele ficarão sem grupo.")) return;
    try {
      const { error } = await supabase.from("customer_groups").delete().eq("id", id);
      if (error) throw error;
      toast.success("Grupo excluído.");
      fetchCustomers();
    } catch (error: any) {
      toast.error("Erro ao excluir grupo", { description: error.message });
    }
  }

  // Filter
  const groupById = (id: string | null | undefined) =>
    id ? groups.find((g) => g.id === id) : undefined;

  const filteredCustomers = customers.filter((cust) => {
    const term = search.toLowerCase();
    const gid = (cust as { group_id?: string | null }).group_id || "";
    const matchGroup =
      groupFilter === "all" ||
      (groupFilter === "none" ? !gid : gid === groupFilter);
    const matchTerm =
      cust.full_name.toLowerCase().includes(term) ||
      (cust.email && cust.email.toLowerCase().includes(term)) ||
      (cust.phone && cust.phone.includes(term)) ||
      (cust.cpf_cnpj && cust.cpf_cnpj.includes(term));
    return matchGroup && matchTerm;
  });

  // Totals
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c) => c.is_active).length;
  const totalDebt = customers.reduce((acc, c) => acc + c.current_debt, 0);

  // Open Dialog to Create
  function handleAddCustomer() {
    setEditingCustomer(null);
    setCustomerForm({ ...emptyForm });
    setIsDialogOpen(true);
  }

  // Open Dialog to Edit
  function handleEditCustomer(customer: Customer) {
    setEditingCustomer(customer);
    setCustomerForm({
      full_name: customer.full_name,
      email: customer.email || "",
      phone: maskPhoneBR(customer.phone || ""),
      cpf_cnpj: customer.cpf_cnpj || "",
      address_street: customer.address_street || "",
      address_number: customer.address_number || "",
      address_complement: customer.address_complement || "",
      address_neighborhood: customer.address_neighborhood || "",
      address_city: customer.address_city || "",
      address_state: customer.address_state || "",
      address_zip: customer.address_zip || "",
      credit_limit: customer.credit_limit.toString(),
      notes: customer.notes || "",
      is_active: customer.is_active,
      group_id: (customer as { group_id?: string | null }).group_id || "",
    });
    setIsDialogOpen(true);
  }

  // Save Customer (Create or Update)
  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault();

    // Validação do telefone (se informado): precisa ter DDD + número (10 ou 11 dígitos)
    const phoneDigits = customerForm.phone.replace(/\D/g, "");
    if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 11)) {
      toast.error("Telefone inválido", {
        description: "Informe DDD + número. Ex: (41) 99179-3307",
      });
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        full_name: customerForm.full_name,
        email: customerForm.email || null,
        phone: customerForm.phone || null,
        cpf_cnpj: customerForm.cpf_cnpj || null,
        address_street: customerForm.address_street || null,
        address_number: customerForm.address_number || null,
        address_complement: customerForm.address_complement || null,
        address_neighborhood: customerForm.address_neighborhood || null,
        address_city: customerForm.address_city || null,
        address_state: customerForm.address_state ? customerForm.address_state.substring(0, 2).toUpperCase() : null,
        address_zip: customerForm.address_zip || null,
        credit_limit: parseFloat(customerForm.credit_limit) || 0,
        notes: customerForm.notes || null,
        is_active: customerForm.is_active,
        group_id: customerForm.group_id || null,
        created_by: profile?.id || null,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editingCustomer.id);

        if (error) throw error;
        toast.success("Cliente atualizado com sucesso!");
      } else {
        const { error } = await supabase.from("customers").insert(payload);

        if (error) throw error;
        toast.success("Cliente cadastrado com sucesso!");
      }

      setIsDialogOpen(false);
      fetchCustomers();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao salvar cliente", {
        description: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  // Delete Customer
  async function handleDeleteCustomer(id: string) {
    if (!isAdmin) return;
    if (!confirm("Deseja realmente excluir este cliente? Toda informação associada será perdida.")) return;

    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;

      toast.success("Cliente excluído!");
      fetchCustomers();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao excluir cliente", {
        description: error.message,
      });
    }
  }

  // Navigate to customer detail page
  function handleViewCustomer(customer: Customer) {
    router.push(`/dashboard/clientes/${customer.id}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            Cadastro de clientes, limite de crédito e contas a receber (crediário).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowValues((v) => !v)}
            title={showValues ? "Ocultar valores" : "Mostrar valores"}
          >
            {showValues ? (
              <EyeOff className="h-4 w-4 sm:mr-2" />
            ) : (
              <Eye className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">
              {showValues ? "Ocultar valores" : "Mostrar valores"}
            </span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchCustomers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${isLoading && "animate-spin"}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setIsGroupsOpen(true)}>
              <UsersRound className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Grupos</span>
            </Button>
          )}
          <Button size="sm" onClick={handleAddCustomer} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo Cliente</span>
          </Button>
        </div>
      </div>

      {/* Cards Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeCustomers} ativos e {totalCustomers - activeCustomers} inativos
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Crediário em Aberto</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-500">
              {showValues
                ? `R$ ${totalDebt.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : "R$ ••••"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total acumulado de parcelas pendentes
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio por Dívida</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {showValues
                ? `R$ ${(totalCustomers > 0 ? totalDebt / totalCustomers : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : "R$ ••••"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Dívida média distribuída por cliente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search Filter */}
      <Card className="border shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail, telefone ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-56">
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os grupos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os grupos</SelectItem>
                <SelectItem value="none">Sem grupo</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-muted-foreground text-sm">Carregando clientes...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 p-4 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="font-semibold text-lg">Nenhum cliente cadastrado</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Não encontramos clientes com esse termo de busca. Cadastre um novo para começar.
            </p>
          </div>
        ) : (
          <>
            {/* ----- Tabela completa (desktop/tablet) ----- */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>CPF / CNPJ</TableHead>
                    <TableHead className="text-right">Dívida / Limite</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((cust) => (
                    <TableRow key={cust.id} className="hover:bg-muted/30">
                      <TableCell className="font-semibold">
                        <button
                          onClick={() => handleViewCustomer(cust)}
                          className="text-left transition-colors hover:text-indigo-600 hover:underline"
                        >
                          {cust.full_name}
                        </button>
                        {(() => {
                          const g = groupById((cust as { group_id?: string | null }).group_id);
                          return g ? (
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: g.color }}
                              />
                              {g.name}
                            </span>
                          ) : null;
                        })()}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="space-y-0.5">
                          {cust.phone && <p>{cust.phone}</p>}
                          {cust.email && <p className="text-xs text-muted-foreground">{cust.email}</p>}
                          {!cust.phone && !cust.email && <p className="text-xs italic text-muted-foreground">Sem contato</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{cust.cpf_cnpj || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-0.5">
                          <p className={`font-semibold ${cust.current_debt > 0 ? "text-rose-500" : ""}`}>
                            {money(cust.current_debt)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Limite: {money(cust.credit_limit)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={cust.is_active ? "outline" : "secondary"}
                          className={
                            cust.is_active
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : ""
                          }
                        >
                          {cust.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewCustomer(cust)}
                            className="h-8 w-8 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditCustomer(cust)}
                            className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteCustomer(cust.id)}
                              className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* ----- Lista simplificada (celular) ----- */}
            <div className="divide-y md:hidden">
              {filteredCustomers.map((cust) => (
                <button
                  key={cust.id}
                  onClick={() => handleViewCustomer(cust)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{cust.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {cust.phone || "Sem telefone"}
                      {showValues && cust.current_debt > 0 && (
                        <span className="text-rose-500"> · deve {money(cust.current_debt)}</span>
                      )}
                    </p>
                    {(() => {
                      const g = groupById((cust as { group_id?: string | null }).group_id);
                      return g ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: g.color }}
                          />
                          {g.name}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!cust.is_active && (
                      <Badge variant="secondary" className="text-[10px]">
                        Inativo
                      </Badge>
                    )}
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            <DialogDescription>
              Insira os dados do cliente e configure o limite de compras no crediário.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCustomer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="full_name">Nome Completo *</Label>
                <Input
                  id="full_name"
                  value={customerForm.full_name}
                  onChange={(e) => setCustomerForm({ ...customerForm, full_name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="exemplo@email.com"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  maxLength={16}
                  placeholder="(41) 99999-8888"
                  value={customerForm.phone}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, phone: maskPhoneBR(e.target.value) })
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  DDD + número (necessário para enviar o comprovante no WhatsApp).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cpf_cnpj">CPF / CNPJ</Label>
                <Input
                  id="cpf_cnpj"
                  placeholder="000.000.000-00"
                  value={customerForm.cpf_cnpj}
                  onChange={(e) => setCustomerForm({ ...customerForm, cpf_cnpj: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="credit_limit">Limite de Crédito - Crediário (R$) *</Label>
                <Input
                  id="credit_limit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={customerForm.credit_limit}
                  onChange={(e) => setCustomerForm({ ...customerForm, credit_limit: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Grupo</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={customerForm.group_id || "none"}
                    onValueChange={(v) =>
                      setCustomerForm({ ...customerForm, group_id: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Sem grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem grupo</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Gerenciar grupos"
                      onClick={() => setIsGroupsOpen(true)}
                      className="shrink-0"
                    >
                      <UsersRound className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="col-span-2 border-t pt-2 mt-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Endereço</h4>
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-1.5">
                <Label htmlFor="address_street">Rua/Logradouro</Label>
                <Input
                  id="address_street"
                  value={customerForm.address_street}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_street: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address_number">Número</Label>
                <Input
                  id="address_number"
                  value={customerForm.address_number}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_number: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address_complement">Complemento</Label>
                <Input
                  id="address_complement"
                  value={customerForm.address_complement}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_complement: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address_neighborhood">Bairro</Label>
                <Input
                  id="address_neighborhood"
                  value={customerForm.address_neighborhood}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_neighborhood: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address_city">Cidade</Label>
                <Input
                  id="address_city"
                  value={customerForm.address_city}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_city: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address_state">Estado (UF)</Label>
                <Input
                  id="address_state"
                  placeholder="SP"
                  maxLength={2}
                  value={customerForm.address_state}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_state: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address_zip">CEP</Label>
                <Input
                  id="address_zip"
                  placeholder="00000-000"
                  value={customerForm.address_zip}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_zip: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  placeholder="Detalhes adicionais sobre o cliente..."
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="col-span-2 flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={customerForm.is_active}
                  onChange={(e) => setCustomerForm({ ...customerForm, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Label htmlFor="is_active" className="font-normal cursor-pointer select-none">
                  Cliente ativo no sistema
                </Label>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCustomer ? "Salvar Alterações" : "Cadastrar Cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Gerenciar Grupos */}
      <Dialog open={isGroupsOpen} onOpenChange={setIsGroupsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Grupos de clientes</DialogTitle>
            <DialogDescription>
              Crie grupos para organizar seus clientes e vincule-os no cadastro.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddGroup} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-group">Novo grupo</Label>
              <Input
                id="new-group"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ex: Atacado, Revenda, VIP..."
              />
            </div>
            <input
              type="color"
              value={newGroupColor}
              onChange={(e) => setNewGroupColor(e.target.value)}
              title="Cor do grupo"
              className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent"
            />
            <Button type="submit" disabled={isSavingGroup} className="shrink-0">
              {isSavingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </form>

          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum grupo cadastrado ainda.
              </p>
            ) : (
              groups.map((g) => {
                const count = customers.filter(
                  (c) => (c as { group_id?: string | null }).group_id === g.id
                ).length;
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full"
                        style={{ backgroundColor: g.color }}
                      />
                      <span className="text-sm font-medium">{g.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {count} cliente(s)
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteGroup(g.id)}
                      className="h-8 w-8 text-rose-500 hover:bg-rose-500/10"
                      title="Excluir grupo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGroupsOpen(false)} className="w-full">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
