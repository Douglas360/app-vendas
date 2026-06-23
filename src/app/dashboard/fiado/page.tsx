"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer, CreditInstallment, CustomerDebtSummary } from "@/lib/types/database";
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
import {
  CreditCard,
  Search,
  Eye,
  TrendingDown,
  AlertTriangle,
  Loader2,
  RefreshCw,
  DollarSign,
  UserCheck,
  Calendar,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function FiadoPage() {
  const supabase = createClient();

  const [debtors, setDebtors] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Details Dialog State
  const [selectedDebtor, setSelectedDebtor] = useState<Customer | null>(null);
  const [installments, setInstallments] = useState<CreditInstallment[]>([]);
  const [debtSummary, setDebtSummary] = useState<CustomerDebtSummary | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Installment Payment Dialog State
  const [selectedInstallment, setSelectedInstallment] = useState<CreditInstallment | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Fetch all customers who have current debt > 0
  const fetchDebtors = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .gt("current_debt", 0)
        .order("current_debt", { ascending: false });

      if (error) throw error;
      setDebtors(data || []);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao buscar clientes inadimplentes", {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDebtors();
  }, [fetchDebtors]);

  // Fetch individual customer debt details & installments
  const loadDebtorDetails = async (debtor: Customer) => {
    setSelectedDebtor(debtor);
    setIsDetailsOpen(true);
    setIsLoadingDetails(true);

    try {
      // 1. Fetch installments
      const { data: instData, error: instError } = await supabase
        .from("credit_installments")
        .select(`
          *,
          sale:sales(sale_number)
        `)
        .eq("customer_id", debtor.id)
        .order("due_date", { ascending: true });

      if (instError) throw instError;
      setInstallments(instData || []);

      // 2. Fetch debt summary via RPC function
      const { data: summaryData, error: summaryError } = await supabase.rpc(
        "get_customer_debt_summary",
        { p_customer_id: debtor.id }
      );

      if (summaryError) throw summaryError;
      
      if (summaryData && summaryData.length > 0) {
        setDebtSummary(summaryData[0] as CustomerDebtSummary);
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao carregar detalhes do débito");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Open register payment modal
  const handleOpenPayment = (installment: CreditInstallment) => {
    setSelectedInstallment(installment);
    const remaining = installment.amount - installment.amount_paid;
    setPaymentAmount(remaining.toString());
    setIsPaymentOpen(true);
  };

  // Confirm payment via Supabase RPC pay_installment
  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallment || !selectedDebtor) return;

    const amount = parseFloat(paymentAmount);
    const remaining = selectedInstallment.amount - selectedInstallment.amount_paid;

    if (isNaN(amount) || amount <= 0) {
      toast.error("Informe um valor de pagamento válido.");
      return;
    }

    if (amount > remaining) {
      toast.error(`O valor excede o saldo restante de R$ ${remaining.toFixed(2)}.`);
      return;
    }

    setIsSubmittingPayment(true);
    try {
      // Call Postgres Function pay_installment
      const { error } = await supabase.rpc("pay_installment", {
        p_installment_id: selectedInstallment.id,
        p_amount: amount,
      });

      if (error) throw error;

      toast.success("Pagamento registrado com sucesso!");
      setIsPaymentOpen(false);
      
      // Refresh current debtor details
      await loadDebtorDetails(selectedDebtor);
      
      // Refresh general list
      fetchDebtors();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao registrar pagamento", {
        description: error.message,
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Filter
  const filteredDebtors = debtors.filter((debtor) => {
    const term = search.toLowerCase();
    return (
      debtor.full_name.toLowerCase().includes(term) ||
      (debtor.phone && debtor.phone.includes(term)) ||
      (debtor.cpf_cnpj && debtor.cpf_cnpj.includes(term))
    );
  });

  // Global calculations
  const totalFiadoOut = debtors.reduce((acc, d) => acc + d.current_debt, 0);
  const debtorsCount = debtors.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Crediário</h1>
          <p className="text-muted-foreground mt-1">
            Controle de contas a receber, extratos de dívida de clientes e baixa de parcelas.
          </p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={fetchDebtors} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading && "animate-spin"}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Geral a Receber</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-500">
              R$ {totalFiadoOut.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Soma de todas as contas em aberto</p>
          </CardContent>
        </Card>

        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Devedores</CardTitle>
            <CreditCard className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{debtorsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Com saldo devedor ativo</p>
          </CardContent>
        </Card>

        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dívida Média</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {(debtorsCount > 0 ? totalFiadoOut / debtorsCount : 0).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Média devida por cliente ativo</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar devedor por nome, telefone ou CPF..."
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
            <p className="text-muted-foreground text-sm">Carregando livro caixa...</p>
          </div>
        ) : filteredDebtors.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 p-4 text-center">
            <UserCheck className="h-12 w-12 text-emerald-500/50" />
            <h3 className="font-semibold text-lg text-emerald-600">Nenhuma pendência ativa!</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Todos os clientes estão com suas contas em dia no momento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Devedor</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>CPF / CNPJ</TableHead>
                  <TableHead className="text-right">Dívida Acumulada</TableHead>
                  <TableHead className="text-right">Limite de Crédito</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDebtors.map((debtor) => (
                  <TableRow key={debtor.id} className="hover:bg-muted/30">
                    <TableCell className="font-semibold">{debtor.full_name}</TableCell>
                    <TableCell className="text-sm">{debtor.phone || "Sem telefone"}</TableCell>
                    <TableCell className="text-sm font-mono">{debtor.cpf_cnpj || "-"}</TableCell>
                    <TableCell className="text-right font-extrabold text-rose-500">
                      R$ {debtor.current_debt.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {debtor.credit_limit === 0 ? "Ilimitado" : `R$ ${debtor.credit_limit.toFixed(2)}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => loadDebtorDetails(debtor)}
                        variant="outline"
                        size="sm"
                        className="text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10 border-indigo-500/20"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Ver Extrato
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Debtor Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Extrato de Crediário: {selectedDebtor?.full_name}</DialogTitle>
            <DialogDescription>
              Ficha detalhada com resumo das parcelas vencidas e em aberto.
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetails ? (
            <div className="flex flex-1 h-60 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Summary Badges */}
              {debtSummary && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 border rounded-xl bg-rose-500/5 text-rose-700 border-rose-500/10">
                    <span className="text-[10px] uppercase font-bold text-rose-500">Total Devido</span>
                    <p className="text-lg font-bold">R$ {debtSummary.total_debt.toFixed(2)}</p>
                  </div>
                  <div className="p-3 border rounded-xl bg-amber-500/5 text-amber-700 border-amber-500/10">
                    <span className="text-[10px] uppercase font-bold text-amber-500">Vencido (Atrasado)</span>
                    <p className="text-lg font-bold">R$ {debtSummary.total_overdue.toFixed(2)}</p>
                  </div>
                  <div className="p-3 border rounded-xl bg-emerald-500/5 text-emerald-700 border-emerald-500/10">
                    <span className="text-[10px] uppercase font-bold text-emerald-500">Total Pago</span>
                    <p className="text-lg font-bold">R$ {debtSummary.total_paid.toFixed(2)}</p>
                  </div>
                </div>
              )}

              {/* Installments Table */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Demonstrativo de Parcelas
                </h4>
                <div className="border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="w-16">Venda</TableHead>
                        <TableHead className="w-20">Parc</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right font-medium">Pago</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Baixa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-4 text-xs italic text-muted-foreground">
                            Nenhuma parcela registrada.
                          </TableCell>
                        </TableRow>
                      ) : (
                        installments.map((inst) => {
                          const remaining = inst.amount - inst.amount_paid;
                          return (
                            <TableRow key={inst.id} className="hover:bg-muted/20 text-xs">
                              <TableCell className="font-mono font-semibold">
                                #{ (inst as any).sale?.sale_number || "?" }
                              </TableCell>
                              <TableCell className="font-medium">
                                {inst.installment_number}ª
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {inst.due_date ? new Date(inst.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                              </TableCell>
                              <TableCell className="text-right font-bold text-foreground">
                                R$ {inst.amount.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-emerald-600 font-semibold">
                                R$ {inst.amount_paid.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  className="text-[10px] py-0.5"
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
                                {inst.status !== "pago" && inst.status !== "cancelado" ? (
                                  <Button
                                    size="sm"
                                    onClick={() => handleOpenPayment(inst)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 text-[10px] px-2.5"
                                  >
                                    Receber
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground text-[10px] italic flex items-center justify-end gap-1 font-medium">
                                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                                    Pago
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)} className="w-full">
              Fechar Extrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Installment Payment Modal */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            <DialogDescription>
              Lance um recebimento (parcial ou total) para amortizar esta parcela de crediário.
            </DialogDescription>
          </DialogHeader>

          {selectedInstallment && (
            <form onSubmit={handleRegisterPayment} className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl border bg-muted/40 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Total da Parcela:</span>
                  <span className="font-bold">R$ {selectedInstallment.amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Já Pago Anteriormente:</span>
                  <span className="font-bold">R$ {selectedInstallment.amount_paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1.5 text-rose-500">
                  <span>Saldo Devedor Restante:</span>
                  <span>R$ {(selectedInstallment.amount - selectedInstallment.amount_paid).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Valor Recebido Agora (R$)</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(selectedInstallment.amount - selectedInstallment.amount_paid).toFixed(2)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setIsPaymentOpen(false)} className="w-full">
                  Voltar
                </Button>
                <Button type="submit" disabled={isSubmittingPayment} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                  {isSubmittingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
