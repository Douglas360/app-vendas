"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Sale } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Receipt,
  Search,
  Eye,
  TrendingUp,
  AlertTriangle,
  Loader2,
  RefreshCw,
  XCircle,
  Clock,
  CheckCircle,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { printReceipt, getStoreInfo, type ReceiptData } from "@/lib/receipt";

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão de Débito",
  cartao_credito: "Cartão de Crédito",
  fiado: "Crediário",
};

export default function VendasPage() {
  const supabase = createClient();

  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  // Selected Sale for Details Modal
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch Sales
  const fetchSales = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          *,
          customer:customers(full_name, phone),
          seller:profiles(full_name),
          items:sale_items(
            *,
            product:products(name, sku, unit)
          ),
          payments:payments(*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao buscar histórico de vendas", {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Cancel Sale
  const handleCancelSale = async (saleId: string) => {
    if (!confirm("Deseja realmente cancelar esta venda? O estoque dos itens será devolvido e a venda será anulada.")) return;
    setIsCancelling(true);

    try {
      // Update sale status to cancelada (database trigger automatically handles stock recovery)
      const { error } = await supabase
        .from("sales")
        .update({ status: "cancelada" })
        .eq("id", saleId);

      if (error) throw error;

      toast.success("Venda cancelada com sucesso!");
      setIsDetailsOpen(false);
      fetchSales();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao cancelar venda", {
        description: error.message,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // Reimprimir recibo de uma venda
  const handlePrintReceipt = async (sale: Sale) => {
    try {
      const hasFiado = sale.payments?.some((p) => p.method === "fiado");
      let installments: ReceiptData["installments"];

      if (hasFiado) {
        const { data: instData } = await supabase
          .from("credit_installments")
          .select("installment_number, amount, due_date")
          .eq("sale_id", sale.id)
          .order("installment_number", { ascending: true });

        if (instData && instData.length > 0) {
          installments = instData.map(
            (i: {
              installment_number: number;
              amount: number;
              due_date: string;
            }) => ({
              number: i.installment_number,
              amount: i.amount,
              dueDate: i.due_date,
            })
          );
        }
      }

      const paymentLabel =
        sale.payments && sale.payments.length > 0
          ? sale.payments
              .map((p) => PAYMENT_LABELS[p.method] || p.method)
              .join(", ")
          : "—";

      const receipt: ReceiptData = {
        store: getStoreInfo(),
        saleNumber: sale.sale_number,
        date: sale.created_at || new Date().toISOString(),
        seller: sale.seller?.full_name || "—",
        customer: sale.customer?.full_name || null,
        items: (sale.items || []).map((item) => ({
          name: item.product?.name || "Produto",
          quantity: item.quantity,
          unit: item.product?.unit || "un",
          unitPrice: item.unit_price,
          total: item.total,
        })),
        subtotal: sale.subtotal,
        discount: sale.discount_amount,
        total: sale.total,
        paymentMethodLabel: paymentLabel,
        installments,
      };

      printReceipt(receipt);
    } catch (error: unknown) {
      console.error(error);
      toast.error("Erro ao gerar recibo");
    }
  };

  // Filter Sales
  const filteredSales = sales.filter((sale) => {
    const matchesStatus = statusFilter === "all" || sale.status === statusFilter;

    // Search by Customer, Seller, or Sale Number
    const term = search.toLowerCase();
    const matchesSearch =
      sale.sale_number.toString().includes(term) ||
      (sale.customer?.full_name && sale.customer.full_name.toLowerCase().includes(term)) ||
      (sale.seller?.full_name && sale.seller.full_name.toLowerCase().includes(term));

    // Simple date filtering
    let matchesDate = true;
    if (dateFilter !== "all" && sale.created_at) {
      const saleDate = new Date(sale.created_at);
      const today = new Date();
      
      if (dateFilter === "today") {
        matchesDate = saleDate.toDateString() === today.toDateString();
      } else if (dateFilter === "week") {
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        matchesDate = saleDate >= lastWeek;
      } else if (dateFilter === "month") {
        matchesDate =
          saleDate.getMonth() === today.getMonth() &&
          saleDate.getFullYear() === today.getFullYear();
      }
    }

    return matchesStatus && matchesSearch && matchesDate;
  });

  // Calculate Metrics
  const finalizedSales = sales.filter((s) => s.status === "finalizada");
  const totalRevenue = finalizedSales.reduce((acc, s) => acc + s.total, 0);
  const averageTicket = finalizedSales.length > 0 ? totalRevenue / finalizedSales.length : 0;
  const totalSalesCount = finalizedSales.length;
  const cancelledCount = sales.filter((s) => s.status === "cancelada").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground mt-1">
            Visualização de histórico de vendas, detalhes de itens e cancelamentos.
          </p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={fetchSales} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading && "animate-spin"}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Geral</CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Vendas finalizadas</p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSalesCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Registradas no sistema</p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <Receipt className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {averageTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Média por venda finalizada</p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Canceladas</CardTitle>
            <XCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-500">{cancelledCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Produtos estornados</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nº da venda, cliente ou vendedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="w-full sm:w-44">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="finalizada">Finalizada</SelectItem>
                <SelectItem value="aberta">Aberta (Rascunho)</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-44">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o período</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Últimos 7 dias</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
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
            <p className="text-muted-foreground text-sm">Carregando histórico...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 p-4 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="font-semibold text-lg">Nenhuma venda encontrada</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Tente redefinir seus filtros ou registre uma nova venda no PDV.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Venda</TableHead>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono font-bold">
                      #{sale.sale_number}
                    </TableCell>
                    <TableCell className="text-sm">
                      {sale.created_at
                        ? new Date(sale.created_at).toLocaleString("pt-BR")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {sale.customer?.full_name || (
                        <span className="text-muted-foreground italic">Cliente Balcão</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {sale.seller?.full_name || "N/A"}
                    </TableCell>
                    <TableCell className="text-right font-extrabold text-indigo-600 dark:text-indigo-400">
                      R$ {sale.total.toFixed(2)}
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
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/15"
                            : ""
                        }
                      >
                        {sale.status === "finalizada"
                          ? "Finalizada"
                          : sale.status === "cancelada"
                          ? "Cancelada"
                          : "Aberta"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedSale(sale);
                            setIsDetailsOpen(true);
                          }}
                          className="h-8 w-8 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {sale.status !== "cancelada" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrintReceipt(sale)}
                            title="Imprimir recibo"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Sale Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ficha da Venda #{selectedSale?.sale_number}</DialogTitle>
            <DialogDescription>
              Detalhamento de produtos vendidos, descontos aplicados e pagamentos.
            </DialogDescription>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-4 pt-2">
              {/* Status Header */}
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/40 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs">Venda realizada por</span>
                  <span className="font-semibold">{selectedSale.seller?.full_name}</span>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground block text-xs">Status da Venda</span>
                  <Badge
                    variant={
                      selectedSale.status === "finalizada"
                        ? "default"
                        : selectedSale.status === "cancelada"
                        ? "destructive"
                        : "secondary"
                    }
                    className={
                      selectedSale.status === "finalizada"
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/15"
                        : ""
                    }
                  >
                    {selectedSale.status}
                  </Badge>
                </div>
              </div>

              {/* Customer Info */}
              <div className="text-sm">
                <span className="text-muted-foreground block text-xs">Cliente</span>
                <span className="font-bold">
                  {selectedSale.customer?.full_name || "Cliente Balcão (Não Identificado)"}
                </span>
                {selectedSale.customer?.phone && (
                  <span className="text-xs text-muted-foreground ml-2">({selectedSale.customer.phone})</span>
                )}
              </div>

              {/* Items List */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-muted/60 p-2 text-xs font-semibold grid grid-cols-12 border-b">
                  <div className="col-span-6">Produto</div>
                  <div className="col-span-2 text-right">Qtd</div>
                  <div className="col-span-2 text-right">Unit</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>
                <div className="divide-y max-h-44 overflow-y-auto">
                  {selectedSale.items?.map((item) => (
                    <div key={item.id} className="p-2 text-xs grid grid-cols-12 items-center">
                      <div className="col-span-6">
                        <p className="font-semibold leading-tight">{(item as any).product?.name}</p>
                        {(item as any).product?.sku && (
                          <span className="text-[10px] text-muted-foreground">SKU: {(item as any).product.sku}</span>
                        )}
                        {item.discount_amount > 0 && (
                          <span className="text-[10px] text-emerald-500 block">Desc: - R$ {item.discount_amount.toFixed(2)}</span>
                        )}
                      </div>
                      <div className="col-span-2 text-right font-medium">
                        {item.quantity} {(item as any).product?.unit || "un"}
                      </div>
                      <div className="col-span-2 text-right">R$ {item.unit_price.toFixed(2)}</div>
                      <div className="col-span-2 text-right font-semibold">R$ {item.total.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculations Detail */}
              <div className="space-y-1.5 border-t pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Subtotal da Venda</span>
                  <span>R$ {selectedSale.subtotal.toFixed(2)}</span>
                </div>
                {selectedSale.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-500 text-xs font-semibold">
                    <span>Desconto Geral ({selectedSale.discount_percent}%)</span>
                    <span>- R$ {selectedSale.discount_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-base pt-1">
                  <span>Total Pago</span>
                  <span className="text-indigo-600 dark:text-indigo-400">R$ {selectedSale.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Payments Section */}
              <div className="border-t pt-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">Formas de Pagamento</h4>
                <div className="space-y-2">
                  {selectedSale.payments?.map((pay) => (
                    <div key={pay.id} className="flex justify-between items-center text-xs border p-2.5 rounded-lg bg-muted/20">
                      <div>
                        <span className="font-semibold capitalize text-foreground">{pay.method.replace("_", " ")}</span>
                        {pay.installments > 1 && <span className="text-muted-foreground ml-1.5">({pay.installments}x)</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">R$ {pay.amount.toFixed(2)}</span>
                        <Badge
                          variant={pay.status === "pago" ? "outline" : "secondary"}
                          className={pay.status === "pago" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"}
                        >
                          {pay.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {selectedSale.notes && (
                <div className="text-xs border-t pt-2 space-y-1">
                  <span className="text-muted-foreground font-semibold">Observações</span>
                  <p className="bg-muted/20 p-2 rounded border leading-relaxed text-muted-foreground">
                    {selectedSale.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-4 border-t flex flex-row items-center gap-2 sm:justify-between">
            {selectedSale && selectedSale.status === "finalizada" ? (
              <Button
                variant="destructive"
                onClick={() => handleCancelSale(selectedSale.id)}
                disabled={isCancelling}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelando...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Cancelar Venda
                  </>
                )}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              {selectedSale && selectedSale.status !== "cancelada" && (
                <Button
                  variant="outline"
                  onClick={() => handlePrintReceipt(selectedSale)}
                  className="font-medium"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir Recibo
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setIsDetailsOpen(false)} className="w-24">
                Fechar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
