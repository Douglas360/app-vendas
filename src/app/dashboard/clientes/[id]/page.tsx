"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import type {
  Customer,
  Sale,
  CreditInstallment,
  CustomerDebtSummary,
} from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ShoppingBag,
  CreditCard,
  DollarSign,
  Wallet,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Plus,
  MessageCircle,
  Receipt,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

// Tipos auxiliares para os dados com joins
type InstallmentRow = CreditInstallment & { sale?: { sale_number: number } };

// Máscara de telefone BR: (41) 99179-3307
function maskPhoneBR(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const emptyCustomerForm = {
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
};

const STATUS_LABEL: Record<string, string> = {
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  aberta: "Aberta",
};

const METHOD_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão Débito",
  cartao_credito: "Cartão Crédito",
  fiado: "Crediário",
};

function currency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function ClienteDetalhePage() {
  const params = useParams<{ id: string }>();
  const customerId = params?.id;
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [summary, setSummary] = useState<CustomerDebtSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expandedSale, setExpandedSale] = useState<string | null>(null);

  // Payment dialog
  const [selectedInstallment, setSelectedInstallment] =
    useState<InstallmentRow | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Edit customer dialog
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Edit installment dialog
  const [editInstallment, setEditInstallment] = useState<InstallmentRow | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    if (!customerId) return;
    setIsLoading(true);
    try {
      const { data: custData, error: custError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      if (custError || !custData) {
        setNotFound(true);
        return;
      }
      setCustomer(custData);

      const [salesRes, instRes, summaryRes] = await Promise.all([
        supabase
          .from("sales")
          .select(
            `*,
            items:sale_items(*, product:products(name, sku, unit)),
            payments:payments(*)`
          )
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("credit_installments")
          .select(`*, sale:sales(sale_number)`)
          .eq("customer_id", customerId)
          .order("due_date", { ascending: true }),
        supabase.rpc("get_customer_debt_summary", {
          p_customer_id: customerId,
        }),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (instRes.error) throw instRes.error;
      if (summaryRes.error) throw summaryRes.error;

      setSales(salesRes.data || []);
      setInstallments((instRes.data as InstallmentRow[]) || []);
      if (summaryRes.data && summaryRes.data.length > 0) {
        setSummary(summaryRes.data[0] as CustomerDebtSummary);
      }
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro ao carregar dados do cliente", { description: message });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Métricas
  const finalizedSales = sales.filter((s) => s.status === "finalizada");
  const totalSpent = finalizedSales.reduce((acc, s) => acc + s.total, 0);
  const purchaseCount = finalizedSales.length;
  const lastPurchase = finalizedSales[0]?.created_at
    ? new Date(finalizedSales[0].created_at).toLocaleDateString("pt-BR")
    : "—";
  const availableCredit =
    customer && customer.credit_limit > 0
      ? Math.max(0, customer.credit_limit - customer.current_debt)
      : null;

  const pendingInstallments = installments.filter(
    (i) => i.status === "pendente" || i.status === "atrasado"
  );

  // Nova venda → abre o PDV com o cliente pré-selecionado
  function handleNewSale() {
    router.push(`/dashboard/pdv?cliente=${customerId}`);
  }

  // WhatsApp
  function handleWhatsApp() {
    if (!customer?.phone) return;
    const digits = customer.phone.replace(/\D/g, "");
    const intl = digits.startsWith("55") ? digits : `55${digits}`;
    const text = encodeURIComponent(
      `Olá ${customer.full_name.split(" ")[0]}, tudo bem?`
    );
    window.open(`https://wa.me/${intl}?text=${text}`, "_blank");
  }

  // Editar cliente
  function handleOpenEditCustomer() {
    if (!customer) return;
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
    });
    setIsEditCustomerOpen(true);
  }

  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;

    const phoneDigits = customerForm.phone.replace(/\D/g, "");
    if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 11)) {
      toast.error("Telefone inválido", {
        description: "Informe DDD + número. Ex: (41) 99179-3307",
      });
      return;
    }

    setIsSavingCustomer(true);
    try {
      const { error } = await supabase
        .from("customers")
        .update({
          full_name: customerForm.full_name,
          email: customerForm.email || null,
          phone: customerForm.phone || null,
          cpf_cnpj: customerForm.cpf_cnpj || null,
          address_street: customerForm.address_street || null,
          address_number: customerForm.address_number || null,
          address_complement: customerForm.address_complement || null,
          address_neighborhood: customerForm.address_neighborhood || null,
          address_city: customerForm.address_city || null,
          address_state: customerForm.address_state
            ? customerForm.address_state.substring(0, 2).toUpperCase()
            : null,
          address_zip: customerForm.address_zip || null,
          credit_limit: parseFloat(customerForm.credit_limit) || 0,
          notes: customerForm.notes || null,
          is_active: customerForm.is_active,
        })
        .eq("id", customer.id);
      if (error) throw error;

      toast.success("Cliente atualizado com sucesso!");
      setIsEditCustomerOpen(false);
      await loadData();
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro ao atualizar cliente", { description: message });
    } finally {
      setIsSavingCustomer(false);
    }
  }

  // Editar parcela (valor e vencimento)
  function handleOpenEdit(inst: InstallmentRow) {
    setEditInstallment(inst);
    setEditAmount(inst.amount.toFixed(2));
    setEditDueDate(inst.due_date);
    setIsEditOpen(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editInstallment) return;

    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (amount < editInstallment.amount_paid) {
      toast.error("Valor inválido", {
        description: `Já foram pagos ${currency(editInstallment.amount_paid)} nesta parcela.`,
      });
      return;
    }
    if (!editDueDate) {
      toast.error("Informe a data de vencimento.");
      return;
    }

    setIsSavingEdit(true);
    try {
      const newStatus =
        amount <= editInstallment.amount_paid + 0.001 ? "pago" : editInstallment.status;
      const { error } = await supabase
        .from("credit_installments")
        .update({ amount, due_date: editDueDate, status: newStatus })
        .eq("id", editInstallment.id);
      if (error) throw error;

      toast.success("Parcela atualizada!");
      setIsEditOpen(false);
      await loadData();
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro ao atualizar a parcela", { description: message });
    } finally {
      setIsSavingEdit(false);
    }
  }

  // Baixa de parcela
  function handleOpenPayment(inst: InstallmentRow) {
    setSelectedInstallment(inst);
    setPaymentAmount((inst.amount - inst.amount_paid).toFixed(2));
    setIsPaymentOpen(true);
  }

  async function handleRegisterPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInstallment) return;

    const amount = parseFloat(paymentAmount);
    const remaining =
      selectedInstallment.amount - selectedInstallment.amount_paid;

    if (isNaN(amount) || amount <= 0) {
      toast.error("Informe um valor de pagamento válido.");
      return;
    }
    if (amount > remaining + 0.001) {
      toast.error(`O valor excede o saldo restante de ${currency(remaining)}.`);
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const { error } = await supabase.rpc("pay_installment", {
        p_installment_id: selectedInstallment.id,
        p_amount: amount,
      });
      if (error) throw error;

      toast.success("Pagamento registrado com sucesso!");
      setIsPaymentOpen(false);
      await loadData();
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro ao registrar pagamento", { description: message });
    } finally {
      setIsSubmittingPayment(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-muted-foreground text-sm">Carregando cliente...</p>
      </div>
    );
  }

  if (notFound || !customer) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-semibold">Cliente não encontrado</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/clientes")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Clientes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/clientes")}
          className="w-fit -ml-2 text-muted-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {customer.full_name}
              </h1>
              <Badge
                variant={customer.is_active ? "outline" : "secondary"}
                className={
                  customer.is_active
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    : ""
                }
              >
                {customer.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {customer.cpf_cnpj ? `CPF/CNPJ: ${customer.cpf_cnpj} · ` : ""}
              Cliente desde{" "}
              {new Date(customer.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            {customer.phone && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleWhatsApp}
                className="text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenEditCustomer}
              className="text-blue-600 border-blue-500/30 hover:bg-blue-500/10"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button
              size="sm"
              onClick={handleNewSale}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova Venda
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gasto</CardTitle>
            <DollarSign className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currency(totalSpent)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Última compra: {lastPurchase}
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compras</CardTitle>
            <ShoppingBag className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchaseCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Vendas finalizadas
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dívida Atual</CardTitle>
            <CreditCard className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                customer.current_debt > 0 ? "text-rose-500" : ""
              }`}
            >
              {currency(customer.current_debt)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingInstallments.length} parcela(s) em aberto
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Crédito Disponível
            </CardTitle>
            <Wallet className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {availableCredit === null
                ? "Ilimitado"
                : currency(availableCredit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Limite:{" "}
              {customer.credit_limit > 0
                ? currency(customer.credit_limit)
                : "Sem limite"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="compras" className="space-y-4">
        <TabsList>
          <TabsTrigger value="compras">
            <Receipt className="mr-1.5 h-4 w-4" />
            Compras
          </TabsTrigger>
          <TabsTrigger value="fiado">
            <CreditCard className="mr-1.5 h-4 w-4" />
            Crediário / Parcelas
            {pendingInstallments.length > 0 && (
              <Badge className="ml-2 h-5 px-1.5 bg-rose-500 text-white">
                {pendingInstallments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dados">
            <Phone className="mr-1.5 h-4 w-4" />
            Dados
          </TabsTrigger>
        </TabsList>

        {/* ---- COMPRAS ---- */}
        <TabsContent value="compras">
          <Card className="border shadow-sm overflow-hidden">
            {sales.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-center">
                <ShoppingBag className="h-10 w-10 text-muted-foreground/40" />
                <h3 className="font-semibold">Nenhuma compra registrada</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Este cliente ainda não possui histórico de compras.
                </p>
                <Button
                  size="sm"
                  onClick={handleNewSale}
                  className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Lançar primeira venda
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead className="w-24">Venda</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((sale) => {
                      const isExpanded = expandedSale === sale.id;
                      return (
                        <Fragment key={sale.id}>
                          <TableRow
                            className="hover:bg-muted/30 cursor-pointer"
                            onClick={() =>
                              setExpandedSale(isExpanded ? null : sale.id)
                            }
                          >
                            <TableCell>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="font-mono font-bold">
                              #{sale.sale_number}
                            </TableCell>
                            <TableCell className="text-sm">
                              {sale.created_at
                                ? new Date(sale.created_at).toLocaleString(
                                    "pt-BR"
                                  )
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {sale.payments && sale.payments.length > 0
                                ? sale.payments
                                    .map(
                                      (p) =>
                                        METHOD_LABEL[p.method] || p.method
                                    )
                                    .join(", ")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={
                                  sale.status === "finalizada"
                                    ? "default"
                                    : sale.status === "cancelada"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className={
                                  sale.status === "finalizada"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : ""
                                }
                              >
                                {STATUS_LABEL[sale.status] || sale.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-extrabold text-indigo-600 dark:text-indigo-400">
                              {currency(sale.total)}
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={6} className="p-0">
                                <div className="p-4 space-y-3">
                                  <div className="border rounded-lg overflow-hidden bg-background">
                                    <div className="grid grid-cols-12 gap-2 bg-muted/50 p-2 text-xs font-semibold">
                                      <div className="col-span-6">Produto</div>
                                      <div className="col-span-2 text-right">Qtd</div>
                                      <div className="col-span-2 text-right">Unit</div>
                                      <div className="col-span-2 text-right">Total</div>
                                    </div>
                                    <div className="divide-y">
                                      {sale.items?.map((item) => (
                                        <div
                                          key={item.id}
                                          className="grid grid-cols-12 gap-2 p-2 text-xs items-center"
                                        >
                                          <div className="col-span-6 font-medium">
                                            {item.product?.name || "Produto"}
                                            {item.product?.sku && (
                                              <span className="text-[10px] text-muted-foreground ml-1">
                                                ({item.product.sku})
                                              </span>
                                            )}
                                          </div>
                                          <div className="col-span-2 text-right">
                                            {item.quantity}{" "}
                                            {item.product?.unit || "un"}
                                          </div>
                                          <div className="col-span-2 text-right">
                                            {currency(item.unit_price)}
                                          </div>
                                          <div className="col-span-2 text-right font-semibold">
                                            {currency(item.total)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap justify-end gap-4 text-xs">
                                    <span className="text-muted-foreground">
                                      Subtotal: {currency(sale.subtotal)}
                                    </span>
                                    {sale.discount_amount > 0 && (
                                      <span className="text-emerald-600">
                                        Desconto: -{" "}
                                        {currency(sale.discount_amount)}
                                      </span>
                                    )}
                                    <span className="font-bold">
                                      Total: {currency(sale.total)}
                                    </span>
                                  </div>
                                  {sale.notes && (
                                    <p className="text-xs text-muted-foreground border-t pt-2">
                                      Obs: {sale.notes}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ---- FIADO / PARCELAS ---- */}
        <TabsContent value="fiado">
          <div className="space-y-4">
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 border rounded-xl bg-rose-500/5 border-rose-500/10">
                  <span className="text-[10px] uppercase font-bold text-rose-500">
                    Total Devido
                  </span>
                  <p className="text-lg font-bold">
                    {currency(summary.total_debt)}
                  </p>
                </div>
                <div className="p-3 border rounded-xl bg-amber-500/5 border-amber-500/10">
                  <span className="text-[10px] uppercase font-bold text-amber-500">
                    Vencido (Atrasado)
                  </span>
                  <p className="text-lg font-bold">
                    {currency(summary.total_overdue)}
                  </p>
                </div>
                <div className="p-3 border rounded-xl bg-emerald-500/5 border-emerald-500/10">
                  <span className="text-[10px] uppercase font-bold text-emerald-500">
                    Total Pago
                  </span>
                  <p className="text-lg font-bold">
                    {currency(summary.total_paid)}
                  </p>
                </div>
              </div>
            )}

            <Card className="border shadow-sm overflow-hidden">
              <CardHeader className="py-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Parcelas
                </CardTitle>
              </CardHeader>
              {installments.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 p-4 text-center">
                  <CheckCircle className="h-10 w-10 text-emerald-500/50" />
                  <p className="text-muted-foreground text-sm">
                    Nenhuma parcela de crediário registrada para este cliente.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Venda</TableHead>
                        <TableHead className="w-16">Parc.</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Pago</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installments.map((inst) => {
                        const isPaid =
                          inst.status === "pago" ||
                          inst.status === "cancelado";
                        return (
                          <TableRow key={inst.id} className="hover:bg-muted/20">
                            <TableCell className="font-mono font-semibold text-sm">
                              #{inst.sale?.sale_number ?? "?"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {inst.installment_number}ª
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {inst.due_date
                                ? new Date(
                                    inst.due_date + "T00:00:00"
                                  ).toLocaleDateString("pt-BR")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {currency(inst.amount)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-600 font-semibold">
                              {currency(inst.amount_paid)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                className="text-[10px]"
                                variant={
                                  inst.status === "pago"
                                    ? "default"
                                    : inst.status === "atrasado"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {inst.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isAdmin && !isPaid && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenEdit(inst)}
                                    title="Editar parcela"
                                    className="h-7 w-7 text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {!isPaid ? (
                                  <Button
                                    size="sm"
                                    onClick={() => handleOpenPayment(inst)}
                                    className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                  >
                                    Receber
                                  </Button>
                                ) : (
                                  <span className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground italic">
                                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                                    {inst.status}
                                  </span>
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
          </div>
        </TabsContent>

        {/* ---- DADOS ---- */}
        <TabsContent value="dados">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Contato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{customer.phone || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{customer.email || "Não informado"}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Endereço</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {customer.address_street ? (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-muted-foreground">
                      <p className="text-foreground font-medium">
                        {customer.address_street}
                        {customer.address_number
                          ? `, ${customer.address_number}`
                          : ""}
                        {customer.address_complement
                          ? ` - ${customer.address_complement}`
                          : ""}
                      </p>
                      <p>
                        {[
                          customer.address_neighborhood,
                          customer.address_city,
                          customer.address_state,
                        ]
                          .filter(Boolean)
                          .join(" - ")}
                      </p>
                      {customer.address_zip && (
                        <p className="text-xs mt-1">
                          CEP: {customer.address_zip}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">
                    Sem endereço cadastrado.
                  </p>
                )}
              </CardContent>
            </Card>

            {customer.notes && (
              <Card className="border shadow-sm md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {customer.notes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditCustomerOpen} onOpenChange={setIsEditCustomerOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Atualize os dados do cliente e o limite de crédito do crediário.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCustomer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="ec-name">Nome Completo *</Label>
                <Input
                  id="ec-name"
                  value={customerForm.full_name}
                  onChange={(e) => setCustomerForm({ ...customerForm, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-email">E-mail</Label>
                <Input
                  id="ec-email"
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-phone">Telefone / WhatsApp</Label>
                <Input
                  id="ec-phone"
                  type="tel"
                  inputMode="tel"
                  maxLength={16}
                  placeholder="(41) 99999-8888"
                  value={customerForm.phone}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, phone: maskPhoneBR(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-cpf">CPF / CNPJ</Label>
                <Input
                  id="ec-cpf"
                  value={customerForm.cpf_cnpj}
                  onChange={(e) => setCustomerForm({ ...customerForm, cpf_cnpj: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-limit">Limite de Crédito - Crediário (R$) *</Label>
                <Input
                  id="ec-limit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={customerForm.credit_limit}
                  onChange={(e) => setCustomerForm({ ...customerForm, credit_limit: e.target.value })}
                  required
                />
              </div>

              <div className="col-span-2 border-t pt-2 mt-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Endereço
                </h4>
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1.5">
                <Label htmlFor="ec-street">Rua/Logradouro</Label>
                <Input
                  id="ec-street"
                  value={customerForm.address_street}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_street: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-number">Número</Label>
                <Input
                  id="ec-number"
                  value={customerForm.address_number}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_number: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-comp">Complemento</Label>
                <Input
                  id="ec-comp"
                  value={customerForm.address_complement}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, address_complement: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-neigh">Bairro</Label>
                <Input
                  id="ec-neigh"
                  value={customerForm.address_neighborhood}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, address_neighborhood: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-city">Cidade</Label>
                <Input
                  id="ec-city"
                  value={customerForm.address_city}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_city: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-uf">Estado (UF)</Label>
                <Input
                  id="ec-uf"
                  maxLength={2}
                  placeholder="PR"
                  value={customerForm.address_state}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_state: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ec-zip">CEP</Label>
                <Input
                  id="ec-zip"
                  value={customerForm.address_zip}
                  onChange={(e) => setCustomerForm({ ...customerForm, address_zip: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="ec-notes">Observações</Label>
                <Textarea
                  id="ec-notes"
                  rows={2}
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                />
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ec-active"
                  checked={customerForm.is_active}
                  onChange={(e) => setCustomerForm({ ...customerForm, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Label htmlFor="ec-active" className="font-normal cursor-pointer select-none">
                  Cliente ativo no sistema
                </Label>
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditCustomerOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSavingCustomer}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isSavingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Installment Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Parcela</DialogTitle>
            <DialogDescription>
              Ajuste o valor e a data de vencimento. A dívida do cliente é recalculada
              automaticamente.
            </DialogDescription>
          </DialogHeader>

          {editInstallment && (
            <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
              <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Parcela</span>
                  <span className="font-semibold">
                    {editInstallment.installment_number}ª · venda #
                    {editInstallment.sale?.sale_number ?? "?"}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Já pago</span>
                  <span className="font-semibold">
                    {currency(editInstallment.amount_paid)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-amount">Valor da parcela (R$)</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-due">Data de vencimento</Label>
                <Input
                  id="edit-due"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  required
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditOpen(false)}
                  className="w-full"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingEdit}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isSavingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            <DialogDescription>
              Lance um recebimento (parcial ou total) para amortizar esta
              parcela.
            </DialogDescription>
          </DialogHeader>

          {selectedInstallment && (
            <form onSubmit={handleRegisterPayment} className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl border bg-muted/40 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor da Parcela:</span>
                  <span className="font-bold">
                    {currency(selectedInstallment.amount)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Já Pago:</span>
                  <span className="font-bold">
                    {currency(selectedInstallment.amount_paid)}
                  </span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1.5 text-rose-500">
                  <span>Saldo Restante:</span>
                  <span>
                    {currency(
                      selectedInstallment.amount -
                        selectedInstallment.amount_paid
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Valor Recebido (R$)</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(
                    selectedInstallment.amount -
                    selectedInstallment.amount_paid
                  ).toFixed(2)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPaymentOpen(false)}
                  className="w-full"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {isSubmittingPayment && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Dar Baixa
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
