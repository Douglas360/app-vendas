"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { toast } from "sonner";

// Tipos auxiliares para os dados com joins
type InstallmentRow = CreditInstallment & { sale?: { sale_number: number } };

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
