"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Sale, Product, Customer, CreditInstallment } from "@/lib/types/database";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowRight,
  TrendingDown,
  Loader2,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = "default",
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  trend?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const gradients = {
    default: "from-indigo-500/10 to-purple-500/10",
    success: "from-emerald-500/10 to-teal-500/10",
    warning: "from-amber-500/10 to-orange-500/10",
    danger: "from-red-500/10 to-rose-500/10",
    info: "from-blue-500/10 to-cyan-500/10",
  };
  const iconColors = {
    default: "text-indigo-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger: "text-red-500",
    info: "text-blue-500",
  };

  return (
    <Card className="relative overflow-hidden border shadow-sm">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradients[variant]} opacity-40`}
      />
      <CardHeader className="relative flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-background/90 border shadow-xs ${iconColors[variant]}`}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-1 mt-1">
          {trend && (
            <span className="flex items-center text-xs font-semibold text-emerald-500">
              <TrendingUp className="mr-0.5 h-3 w-3" />
              {trend}
            </span>
          )}
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);

  // Stats
  const [salesTodayTotal, setSalesTodayTotal] = useState(0);
  const [salesTodayCount, setSalesTodayCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [customersCount, setCustomersCount] = useState(0);
  const [fiadoTotal, setFiadoTotal] = useState(0);

  // Alerts
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [overdueInstallments, setOverdueInstallments] = useState<any[]>([]);

  // Lists
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; total: number }[]>([]);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // 1. Fetch sales today
      const { data: salesToday, error: salesError } = await supabase
        .from("sales")
        .select("total, status")
        .eq("status", "finalizada")
        .gte("created_at", todayStart.toISOString());

      if (salesError) throw salesError;

      const salesSum = salesToday?.reduce((acc: number, s: any) => acc + s.total, 0) || 0;
      setSalesTodayTotal(salesSum);
      setSalesTodayCount(salesToday?.length || 0);

      // 2. Fetch products count
      const { count: prodCount, error: prodErr } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });
      if (prodErr) throw prodErr;
      setProductsCount(prodCount || 0);

      // 3. Fetch customers count & total debt
      const { data: custData, error: custErr } = await supabase
        .from("customers")
        .select("current_debt");
      if (custErr) throw custErr;
      setCustomersCount(custData?.length || 0);
      setFiadoTotal(custData?.reduce((acc: number, c: any) => acc + c.current_debt, 0) || 0);

      // 4. Fetch low stock products (limit 5)
      const { data: lowStockData } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("stock_quantity", { ascending: true })
        .limit(10);
      
      const filteredLowStock = lowStockData?.filter((p: any) => p.stock_quantity <= p.min_stock) || [];
      setLowStockProducts(filteredLowStock);

      // 5. Fetch overdue installments
      const { data: overdueData } = await supabase
        .from("credit_installments")
        .select(`
          *,
          customer:customers(full_name)
        `)
        .eq("status", "atrasado")
        .order("due_date", { ascending: true })
        .limit(5);
      setOverdueInstallments(overdueData || []);

      // 6. Fetch recent sales (limit 5)
      const { data: recSales } = await supabase
        .from("sales")
        .select(`
          *,
          customer:customers(full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentSales(recSales || []);

      // 7. Get Top Selling products (simulated aggregating from sale items)
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select(`
          quantity,
          total,
          product:products(name)
        `)
        .limit(50); // Get latest 50 items

      const prodAgg: Record<string, { qty: number; total: number }> = {};
      saleItems?.forEach((item: any) => {
        const name = (item as any).product?.name || "Produto Desconhecido";
        if (!prodAgg[name]) {
          prodAgg[name] = { qty: 0, total: 0 };
        }
        prodAgg[name].qty += item.quantity;
        prodAgg[name].total += item.total;
      });

      const sortedTop = Object.entries(prodAgg)
        .map(([name, val]) => ({ name, qty: val.qty, total: val.total }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      setTopProducts(sortedTop);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao atualizar métricas do Dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral do seu negócio e status financeiro hoje.
          </p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={fetchDashboardData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading && "animate-spin"}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Faturamento Hoje"
          value={`R$ ${salesTodayTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          description="vendas finalizadas hoje"
          icon={DollarSign}
          variant="success"
        />
        <StatCard
          title="Pedidos Hoje"
          value={salesTodayCount.toString()}
          description="atendimentos concluídos"
          icon={ShoppingCart}
          variant="default"
        />
        <StatCard
          title="Fiado a Receber"
          value={`R$ ${fiadoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          description="saldo devedor ativo"
          icon={TrendingDown}
          variant="danger"
        />
        <StatCard
          title="Produtos"
          value={productsCount.toString()}
          description="itens cadastrados"
          icon={Package}
          variant="warning"
        />
        <StatCard
          title="Clientes"
          value={customersCount.toString()}
          description="contatos cadastrados"
          icon={Users}
          variant="info"
        />
      </div>

      {/* Alerts & Insights */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Low Stock Alerts */}
        <Card className="lg:col-span-2 border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alertas de Estoque Baixo
            </CardTitle>
            <CardDescription>Produtos ativos que atingiram o limite mínimo configurado</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {isLoading ? (
              <div className="flex h-44 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : lowStockProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <AlertTriangle className="h-10 w-10 mb-2 opacity-20 text-emerald-500" />
                <p className="text-xs">Estoque saudável! Nenhum produto em alerta.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd Atual</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.slice(0, 5).map((prod) => (
                    <TableRow key={prod.id}>
                      <TableCell className="font-semibold text-xs">{prod.name}</TableCell>
                      <TableCell className="text-right font-bold text-rose-500">
                        {prod.stock_quantity} {prod.unit}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {prod.min_stock} {prod.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive" className="text-[10px] py-0">
                          Repor Urgente
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <CardFooter className="py-3 bg-muted/10 border-t justify-end shrink-0">
            <Link href="/dashboard/produtos" className="text-xs font-semibold text-indigo-500 flex items-center gap-1 hover:underline">
              Ir para Produtos
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>

        {/* Overdue Installments */}
        <Card className="border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-rose-500" />
              Fiado Atrasado
            </CardTitle>
            <CardDescription>Clientes com parcelas vencidas e em atraso</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-4">
            {isLoading ? (
              <div className="flex h-44 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : overdueInstallments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Calendar className="h-10 w-10 mb-2 opacity-20 text-emerald-500" />
                <p className="text-xs">Sem parcelas em atraso no momento.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overdueInstallments.map((inst) => {
                  const delayDays = Math.ceil(
                    (new Date().getTime() - new Date(inst.due_date).getTime()) / (1000 * 3600 * 24)
                  );
                  return (
                    <div key={inst.id} className="flex justify-between items-center text-xs border p-2.5 rounded-lg bg-rose-500/5 border-rose-500/10">
                      <div>
                        <p className="font-bold text-foreground">{inst.customer?.full_name}</p>
                        <p className="text-[10px] text-rose-500 font-medium">Vencido há {delayDays} dias</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-rose-600">R$ {(inst.amount - inst.amount_paid).toFixed(2)}</p>
                        <p className="text-[9px] text-muted-foreground">Parc {inst.installment_number}ª</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          <CardFooter className="py-3 bg-muted/10 border-t justify-end shrink-0">
            <Link href="/dashboard/fiado" className="text-xs font-semibold text-indigo-500 flex items-center gap-1 hover:underline">
              Ir para Cobrança
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Transactions */}
        <Card className="border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-bold">Vendas Recentes</CardTitle>
            <CardDescription>Últimas operações de caixa realizadas</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {isLoading ? (
              <div className="flex h-60 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : recentSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-xs">Nenhuma venda registrada.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venda</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono font-bold text-xs">#{sale.sale_number}</TableCell>
                      <TableCell className="text-xs font-medium">
                        {sale.customer?.full_name || <span className="text-muted-foreground italic">Cliente Balcão</span>}
                      </TableCell>
                      <TableCell className="text-right font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                        R$ {sale.total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={sale.status === "finalizada" ? "default" : "secondary"}
                          className={`text-[9px] py-0 ${sale.status === "finalizada" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : ""}`}
                        >
                          {sale.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <CardFooter className="py-3 bg-muted/10 border-t justify-end shrink-0">
            <Link href="/dashboard/vendas" className="text-xs font-semibold text-indigo-500 flex items-center gap-1 hover:underline">
              Histórico Completo
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>

        {/* Top Selling Products */}
        <Card className="border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-bold">Produtos Mais Vendidos</CardTitle>
            <CardDescription>Classificação com base na quantidade vendida</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-4">
            {isLoading ? (
              <div className="flex h-60 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Package className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-xs">Sem dados de movimentação.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {topProducts.map((prod, index) => {
                  const maxQty = topProducts[0]?.qty || 1;
                  const percentWidth = Math.max(10, Math.min(100, (prod.qty / maxQty) * 100));
                  return (
                    <div key={index} className="space-y-1.5 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span>{prod.name}</span>
                        <span>{prod.qty} un</span>
                      </div>
                      <div className="h-3.5 w-full bg-muted rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
                          style={{ width: `${percentWidth}%` }}
                        />
                      </div>
                      <div className="text-right text-[10px] text-muted-foreground font-semibold">
                        Total Recebido: R$ {prod.total.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          <CardFooter className="py-3 bg-muted/10 border-t justify-end shrink-0">
            <Link href="/dashboard/pdv" className="text-xs font-semibold text-indigo-500 flex items-center gap-1 hover:underline">
              Ir para o Caixa
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
