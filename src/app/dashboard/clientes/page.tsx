"use client";

import { useEffect, useState, useCallback } from "react";
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
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
  CreditCard,
  TrendingDown,
  Loader2,
  RefreshCw,
  Eye,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";

export default function ClientesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Customer Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({
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
  });
  const [isSaving, setIsSaving] = useState(false);

  // View Customer Details Sheet
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Fetch Data
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("full_name");

      if (error) throw error;
      setCustomers(data || []);
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

  // Filter
  const filteredCustomers = customers.filter((cust) => {
    const term = search.toLowerCase();
    return (
      cust.full_name.toLowerCase().includes(term) ||
      (cust.email && cust.email.toLowerCase().includes(term)) ||
      (cust.phone && cust.phone.includes(term)) ||
      (cust.cpf_cnpj && cust.cpf_cnpj.includes(term))
    );
  });

  // Totals
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c) => c.is_active).length;
  const totalDebt = customers.reduce((acc, c) => acc + c.current_debt, 0);

  // Open Dialog to Create
  function handleAddCustomer() {
    setEditingCustomer(null);
    setCustomerForm({
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
    });
    setIsDialogOpen(true);
  }

  // Open Dialog to Edit
  function handleEditCustomer(customer: Customer) {
    setEditingCustomer(customer);
    setCustomerForm({
      full_name: customer.full_name,
      email: customer.email || "",
      phone: customer.phone || "",
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
    });
    setIsDialogOpen(true);
  }

  // Save Customer (Create or Update)
  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault();
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

  // Open Details Sheet
  function handleViewCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setIsDetailsOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            Cadastro de clientes, limite de crédito e contas a receber (fiado).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchCustomers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading && "animate-spin"}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={handleAddCustomer} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
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
            <CardTitle className="text-sm font-medium">Total Fiado em Aberto</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-500">
              R$ {totalDebt.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
              R${" "}
              {(totalCustomers > 0 ? totalDebt / totalCustomers : 0).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Dívida média distribuída por cliente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search Filter */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail, telefone ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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
          <div className="overflow-x-auto">
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
                {filteredCustomers.map((cust) => {
                  const limitExceeded = cust.current_debt >= cust.credit_limit && cust.credit_limit > 0;
                  return (
                    <TableRow key={cust.id} className="hover:bg-muted/30">
                      <TableCell className="font-semibold">
                        {cust.full_name}
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
                            R$ {cust.current_debt.toFixed(2)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Limite: R$ {cust.credit_limit.toFixed(2)}
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            <DialogDescription>
              Insira os dados do cliente e configure o limite de compras no fiado/crediário.
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
                <Label htmlFor="phone">Telefone / Whats</Label>
                <Input
                  id="phone"
                  placeholder="(11) 99999-8888"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                />
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
                <Label htmlFor="credit_limit">Limite de Crédito Fiado (R$) *</Label>
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

      {/* Details Sheets / Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Cliente</DialogTitle>
            <DialogDescription>
              Ficha cadastral completa e situação de crédito.
            </DialogDescription>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl bg-muted/40 p-4 border space-y-2">
                <h4 className="font-bold text-base">{selectedCustomer.full_name}</h4>
                {selectedCustomer.cpf_cnpj && (
                  <p className="text-xs font-mono text-muted-foreground">CPF/CNPJ: {selectedCustomer.cpf_cnpj}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Badge variant={selectedCustomer.is_active ? "default" : "secondary"}>
                    {selectedCustomer.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>

              {/* Debt and Credit Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 border rounded-xl bg-rose-500/5 text-rose-700 border-rose-500/10">
                  <span className="text-[10px] uppercase font-bold text-rose-500">Dívida Atual</span>
                  <p className="text-lg font-bold">R$ {selectedCustomer.current_debt.toFixed(2)}</p>
                </div>
                <div className="p-3 border rounded-xl bg-indigo-500/5 text-indigo-700 border-indigo-500/10">
                  <span className="text-[10px] uppercase font-bold text-indigo-500">Limite de Crédito</span>
                  <p className="text-lg font-bold">R$ {selectedCustomer.credit_limit.toFixed(2)}</p>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-2 text-sm">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Informações de Contato</h4>
                <div className="divide-y border-y">
                  <div className="py-2 flex justify-between">
                    <span className="text-muted-foreground">Telefone:</span>
                    <span className="font-medium">{selectedCustomer.phone || "-"}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-muted-foreground">E-mail:</span>
                    <span className="font-medium">{selectedCustomer.email || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Address Info */}
              <div className="space-y-2 text-sm">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Endereço</h4>
                {selectedCustomer.address_street ? (
                  <div className="border p-3 rounded-xl bg-muted/20 text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {selectedCustomer.address_street}, {selectedCustomer.address_number}
                      {selectedCustomer.address_complement && ` - ${selectedCustomer.address_complement}`}
                    </p>
                    <p>
                      {selectedCustomer.address_neighborhood} - {selectedCustomer.address_city}/{selectedCustomer.address_state}
                    </p>
                    <p className="text-xs mt-1">CEP: {selectedCustomer.address_zip}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sem endereço cadastrado.</p>
                )}
              </div>

              {/* Notes */}
              {selectedCustomer.notes && (
                <div className="space-y-2 text-sm border-t pt-2">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Observações</h4>
                  <p className="text-muted-foreground text-xs leading-relaxed bg-muted/20 p-2.5 rounded-xl border">
                    {selectedCustomer.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)} className="w-full">
              Fechar Ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
