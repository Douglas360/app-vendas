"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import type { Product, ProductCategory, Customer } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Barcode,
  User,
  CreditCard,
  DollarSign,
  Loader2,
  TrendingDown,
  Percent,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface CartItem extends Product {
  quantity: number;
  discount: number; // individual discount value in R$
}

export default function PDVPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [saleDiscountPercent, setSaleDiscountPercent] = useState<number>(0);
  const [notes, setNotes] = useState("");

  // Barcode scan input
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"dinheiro" | "pix" | "cartao_debito" | "cartao_credito" | "fiado">("dinheiro");
  const [cashReceived, setCashReceived] = useState("");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [isFinishing, setIsFinishing] = useState(false);
  const [saleFinishedSuccess, setSaleFinishedSuccess] = useState(false);
  const [latestSaleNumber, setLatestSaleNumber] = useState<number | null>(null);

  // Fetch initial data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: prodData } = await supabase
        .from("products")
        .select(`*, category:product_categories(*)`)
        .eq("is_active", true)
        .order("name");

      const { data: catData } = await supabase
        .from("product_categories")
        .select("*")
        .order("name");

      const { data: custData } = await supabase
        .from("customers")
        .select("*")
        .eq("is_active", true)
        .order("full_name");

      setProducts(prodData || []);
      setCategories(catData || []);
      setCustomers(custData || []);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao carregar dados do PDV");
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Focus barcode input on mount and keep it focused
  useEffect(() => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, []);

  // Selected customer object
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  // Search filter
  const filteredProducts = products.filter((prod) => {
    const matchesSearch =
      prod.name.toLowerCase().includes(search.toLowerCase()) ||
      prod.sku?.toLowerCase().includes(search.toLowerCase()) ||
      prod.barcode?.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      activeCategory === "all" || prod.category_id === activeCategory;

    return matchesSearch && matchesCategory;
  });

  // Cart operations
  const addToCart = (product: Product) => {
    if (product.stock_quantity <= 0) {
      toast.warning(`Produto ${product.name} sem estoque disponível.`);
    }

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id);
      if (existing) {
        // Limit check based on stock (warning only)
        if (existing.quantity >= product.stock_quantity) {
          toast.warning(`Adicionando mais unidades que o estoque atual (${product.stock_quantity}).`);
        }
        return prevCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1, discount: 0 }];
    });

    // Reset barcode focus
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const updateItemDiscount = (productId: string, discountVal: number) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === productId ? { ...item, discount: Math.max(0, discountVal) } : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== productId));
  };

  // Barcode search / scan simulation
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const matched = products.find(
      (p) => p.barcode === barcodeInput.trim() || p.sku === barcodeInput.trim()
    );

    if (matched) {
      addToCart(matched);
      toast.success(`${matched.name} adicionado ao carrinho!`);
      // Simulate POS beep sound
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } catch (err) {}
    } else {
      toast.error("Produto não encontrado pelo código de barras/SKU.");
    }
    setBarcodeInput("");
  };

  // Cart Calculations
  const subtotal = cart.reduce(
    (acc, item) => acc + item.quantity * item.sale_price - item.discount,
    0
  );
  const totalDiscount = (subtotal * saleDiscountPercent) / 100;
  const grandTotal = Math.max(0, subtotal - totalDiscount);

  // Credit check validation for Fiado
  const isCreditAllowed = () => {
    if (!selectedCustomer) return false;
    // If limit is 0, credit is unlimited, otherwise check limit
    if (selectedCustomer.credit_limit === 0) return true;
    return selectedCustomer.current_debt + grandTotal <= selectedCustomer.credit_limit;
  };

  // Checkout processing
  const handleOpenCheckout = () => {
    if (cart.length === 0) {
      toast.error("Carrinho vazio!");
      return;
    }
    if (paymentMethod === "fiado" && !selectedCustomerId) {
      toast.error("Selecione um cliente para prosseguir com Fiado.");
      return;
    }
    setIsCheckoutOpen(true);
    setCashReceived("");
    setInstallmentCount("1");
    setSaleFinishedSuccess(false);
  };

  // Create Sale transaction logic
  const handleCheckoutSubmit = async () => {
    if (!profile) return;
    setIsFinishing(true);

    try {
      // 1. Validate credit limit for Fiado
      if (paymentMethod === "fiado") {
        if (!selectedCustomerId) {
          throw new Error("Cliente obrigatório para pagamento Fiado.");
        }
        if (!isCreditAllowed()) {
          throw new Error(
            `Limite de crédito do cliente excedido. Dívida atual: R$ ${selectedCustomer?.current_debt.toFixed(
              2
            )}, Limite: R$ ${selectedCustomer?.credit_limit.toFixed(2)}, Compra: R$ ${grandTotal.toFixed(2)}`
          );
        }
      }

      // 2. Insert Sale header (aberta)
      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .insert({
          customer_id: selectedCustomerId || null,
          seller_id: profile.id,
          subtotal: subtotal,
          discount_amount: totalDiscount,
          discount_percent: saleDiscountPercent,
          total: grandTotal,
          status: "aberta", // Insert as 'aberta' so that changing to 'finalizada' triggers stock updates
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // 3. Insert Sale Items
      const itemsPayload = cart.map((item) => ({
        sale_id: saleData.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.sale_price,
        cost_price: item.cost_price,
        discount_amount: item.discount,
        total: item.quantity * item.sale_price - item.discount,
      }));

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      // 4. Create Payment
      const { data: paymentData, error: paymentError } = await supabase
        .from("payments")
        .insert({
          sale_id: saleData.id,
          customer_id: selectedCustomerId || null,
          method: paymentMethod,
          status: paymentMethod === "fiado" ? "pendente" : "pago",
          amount: grandTotal,
          installments: parseInt(installmentCount) || 1,
          notes: paymentMethod === "fiado" ? "Compra no fiado" : null,
          paid_at: paymentMethod === "fiado" ? null : new Date().toISOString(),
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 5. If fiado, create credit installments
      if (paymentMethod === "fiado") {
        const installments = parseInt(installmentCount) || 1;
        const installmentsPayload = Array.from({ length: installments }).map((_, i) => {
          const installmentNum = i + 1;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30 * installmentNum); // 30, 60, 90 days

          return {
            payment_id: paymentData.id,
            customer_id: selectedCustomerId!,
            sale_id: saleData.id,
            installment_number: installmentNum,
            amount: grandTotal / installments,
            amount_paid: 0,
            due_date: dueDate.toISOString().split("T")[0],
            status: "pendente",
          };
        });

        const { error: instError } = await supabase
          .from("credit_installments")
          .insert(installmentsPayload);

        if (instError) throw instError;
      }

      // 6. Update Sale Status to 'finalizada' to trigger database stock deductions
      const { data: updatedSale, error: statusError } = await supabase
        .from("sales")
        .update({ status: "finalizada" })
        .eq("id", saleData.id)
        .select()
        .single();

      if (statusError) throw statusError;

      setLatestSaleNumber(updatedSale.sale_number);
      setSaleFinishedSuccess(true);
      setCart([]);
      setSelectedCustomerId(null);
      setSaleDiscountPercent(0);
      setNotes("");
      loadData(); // Reload stock in catalog
      toast.success("Venda finalizada com sucesso!");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao registrar venda", {
        description: error.message || "Tente novamente.",
      });
    } finally {
      setIsFinishing(false);
    }
  };

  // Change Calculator for Cash Payment
  const changeValue = parseFloat(cashReceived) - grandTotal;

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100vh-6.5rem)] lg:flex-row">
      {/* Left Column: Products Catalog */}
      <div className="flex flex-1 flex-col gap-4 min-w-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PDV (Ponto de Venda)</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Frente de caixa ágil. Adicione itens clicando ou bipe o código de barras.
          </p>
        </div>

        {/* Search Barcode & Name */}
        <div className="grid gap-3 sm:grid-cols-3">
          <form onSubmit={handleBarcodeSubmit} className="relative sm:col-span-1">
            <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={barcodeInputRef}
              placeholder="Bipar Código / SKU..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="pl-9 font-mono"
            />
          </form>

          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Categories tags filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-thin">
          <Button
            variant={activeCategory === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory("all")}
            className="rounded-full px-4 text-xs font-semibold shrink-0"
          >
            Todos
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat.id)}
              className="rounded-full px-4 text-xs font-semibold shrink-0"
            >
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Catalog list */}
        <ScrollArea className="flex-1 border rounded-2xl bg-muted/10 p-4 shadow-inner">
          {isLoading ? (
            <div className="flex h-60 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center gap-2 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm">Nenhum produto cadastrado ou ativo.</p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((prod) => {
                const outOfStock = prod.stock_quantity <= 0;
                return (
                  <button
                    key={prod.id}
                    disabled={outOfStock}
                    onClick={() => addToCart(prod)}
                    className={`flex flex-col text-left border bg-card rounded-xl p-3 shadow-sm transition-all duration-200 group relative ${
                      outOfStock
                        ? "opacity-50 cursor-not-allowed bg-muted/40"
                        : "hover:border-indigo-500 hover:shadow-md hover:scale-[1.02]"
                    }`}
                  >
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {prod.sku || "Sem SKU"}
                      </span>
                      <h4 className="font-semibold text-sm line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                        {prod.name}
                      </h4>
                    </div>

                    <div className="flex justify-between items-end mt-4 pt-2 border-t w-full">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase block font-bold">Venda</span>
                        <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                          R$ {prod.sale_price.toFixed(2)}
                        </span>
                      </div>
                      <Badge
                        variant={prod.stock_quantity <= prod.min_stock ? "destructive" : "secondary"}
                        className="text-[10px] py-0.5 font-bold"
                      >
                        Estoque: {prod.stock_quantity}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Column: Shopping Cart and Checkout */}
      <Card className="w-full lg:w-96 shrink-0 border flex flex-col shadow-lg overflow-hidden h-[500px] lg:h-full">
        <CardHeader className="py-4 border-b bg-muted/20 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-indigo-500" />
            Carrinho ({cart.reduce((acc, i) => acc + i.quantity, 0)})
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCart([])}
            disabled={cart.length === 0}
            className="text-muted-foreground text-xs hover:text-rose-500"
          >
            Limpar
          </Button>
        </CardHeader>

        {/* Selected Customer */}
        <div className="p-3 border-b bg-indigo-500/5">
          <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Cliente da Venda</Label>
          <Select value={selectedCustomerId || "none"} onValueChange={(val) => setSelectedCustomerId(val === "none" ? null : val)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Cliente Balcão (Não Identificado)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Cliente Balcão (Não Identificado)</SelectItem>
              {customers.map((cust) => (
                <SelectItem key={cust.id} value={cust.id}>
                  {cust.full_name} ({cust.phone || "Sem tel"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedCustomer && (
            <div className="mt-2 flex items-center justify-between text-xs p-2 rounded-lg bg-background border">
              <div>
                <span className="text-muted-foreground">Débito:</span>{" "}
                <span className="font-bold text-rose-500">R$ {selectedCustomer.current_debt.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Limite:</span>{" "}
                <span className="font-bold">
                  {selectedCustomer.credit_limit === 0 ? "Ilimitado" : `R$ ${selectedCustomer.credit_limit.toFixed(2)}`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Cart List */}
        <ScrollArea className="flex-1 p-3">
          {cart.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-1.5 text-muted-foreground/60 text-center">
              <ShoppingCart className="h-8 w-8 stroke-1" />
              <p className="text-xs">O carrinho está vazio</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex gap-2.5 items-start justify-between border-b pb-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <h5 className="font-semibold truncate">{item.name}</h5>
                    <p className="text-xs text-muted-foreground">
                      Unit: R$ {item.sale_price.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Label htmlFor={`disc-${item.id}`} className="text-[10px] text-muted-foreground">Desc. R$</Label>
                      <Input
                        id={`disc-${item.id}`}
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={item.discount || ""}
                        onChange={(e) => updateItemDiscount(item.id, parseFloat(e.target.value) || 0)}
                        className="h-6 w-16 text-xs px-1 text-center font-semibold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center border rounded-lg h-7 overflow-hidden shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateQuantity(item.id, -1)}
                        className="h-6 w-6 rounded-none hover:bg-muted"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateQuantity(item.id, 1)}
                        className="h-6 w-6 rounded-none hover:bg-muted"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <span className="font-bold text-xs text-foreground mt-0.5">
                      R$ {((item.quantity * item.sale_price) - item.discount).toFixed(2)}
                    </span>

                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-muted-foreground hover:text-rose-500 transition-colors p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Calculations / Summary */}
        <div className="p-4 border-t bg-muted/10 space-y-3 shrink-0">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5 text-indigo-500" />
                Desconto (%)
              </span>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={saleDiscountPercent || ""}
                onChange={(e) => setSaleDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                className="h-7 w-16 text-right text-xs px-2"
              />
            </div>

            {totalDiscount > 0 && (
              <div className="flex justify-between text-emerald-500 font-semibold">
                <span>Desconto Total</span>
                <span>- R$ {totalDiscount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-base font-extrabold pt-2 border-t">
              <span>Total a Pagar</span>
              <span className="text-lg text-indigo-600 dark:text-indigo-400">
                R$ {grandTotal.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Input
              placeholder="Observações da venda..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 text-xs placeholder:text-muted-foreground/60"
            />
            <Button
              onClick={handleOpenCheckout}
              disabled={cart.length === 0}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold h-11 shadow-md transition-all duration-200"
            >
              Registrar Pagamento
            </Button>
          </div>
        </div>
      </Card>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-md">
          {saleFinishedSuccess ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 animate-bounce" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Venda Finalizada!</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  A venda nº <span className="font-bold text-foreground">#{latestSaleNumber}</span> foi gravada com sucesso.
                </p>
              </div>
              <Button onClick={() => setIsCheckoutOpen(false)} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white w-full">
                Nova Venda
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Finalizar Venda</DialogTitle>
                <DialogDescription>
                  Selecione o método de pagamento e confirme para concluir a venda.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* Total Detail */}
                <div className="rounded-xl bg-indigo-500/5 p-4 border border-indigo-500/10 flex justify-between items-center">
                  <span className="font-bold text-sm text-indigo-700 dark:text-indigo-400">Total da Venda</span>
                  <span className="font-extrabold text-2xl text-indigo-600 dark:text-indigo-400">
                    R$ {grandTotal.toFixed(2)}
                  </span>
                </div>

                {/* Payment Selection */}
                <div className="space-y-2">
                  <Label>Método de Pagamento</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(val: any) => setPaymentMethod(val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="fiado">Fiado / Crediário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Cash Method calculator */}
                {paymentMethod === "dinheiro" && (
                  <div className="space-y-3 p-3 bg-muted/40 rounded-xl border">
                    <div className="space-y-1">
                      <Label htmlFor="cash-received">Valor Recebido (R$)</Label>
                      <Input
                        id="cash-received"
                        type="number"
                        step="0.01"
                        placeholder="Ex: 50.00"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                      />
                    </div>
                    {cashReceived && (
                      <div className="flex justify-between items-center text-sm pt-2 border-t border-muted">
                        <span className="text-muted-foreground font-semibold">Troco:</span>
                        <span className={`text-lg font-extrabold ${changeValue >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {changeValue >= 0
                            ? `R$ ${changeValue.toFixed(2)}`
                            : `Falta R$ ${Math.abs(changeValue).toFixed(2)}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Credit Card Installments */}
                {paymentMethod === "cartao_credito" && (
                  <div className="space-y-2 p-3 bg-muted/40 rounded-xl border">
                    <Label htmlFor="installments-cred">Quantidade de Parcelas</Label>
                    <Select value={installmentCount} onValueChange={setInstallmentCount}>
                      <SelectTrigger id="installments-cred">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }).map((_, idx) => (
                          <SelectItem key={idx} value={(idx + 1).toString()}>
                            {idx + 1}x de R$ {(grandTotal / (idx + 1)).toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Fiado Installments / Check */}
                {paymentMethod === "fiado" && (
                  <div className="space-y-3 p-3 bg-muted/40 rounded-xl border">
                    {!selectedCustomerId ? (
                      <div className="flex items-center gap-2 text-rose-500 text-sm">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Selecione um cliente no menu lateral do carrinho.</span>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="installments-fiado">Parcelar no Fiado (em 30, 60, 90 dias...)</Label>
                          <Select value={installmentCount} onValueChange={setInstallmentCount}>
                            <SelectTrigger id="installments-fiado">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1x (30 dias)</SelectItem>
                              <SelectItem value="2">2x (30/60 dias)</SelectItem>
                              <SelectItem value="3">3x (30/60/90 dias)</SelectItem>
                              <SelectItem value="4">4x</SelectItem>
                              <SelectItem value="6">6x</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Credit evaluation */}
                        {selectedCustomer && (
                          <div className={`text-xs p-2.5 rounded-lg border font-medium flex items-center gap-2 ${
                            isCreditAllowed()
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                          }`}>
                            {isCreditAllowed() ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                <span>Compra Autorizada! Cliente possui R$ {(selectedCustomer.credit_limit - selectedCustomer.current_debt).toFixed(2)} de limite livre.</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                                <span>Compra Negada! Limite de crédito excedido por R$ {(selectedCustomer.current_debt + grandTotal - selectedCustomer.credit_limit).toFixed(2)}.</span>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="pt-4 gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCheckoutOpen(false)}>
                  Voltar
                </Button>
                <Button
                  onClick={handleCheckoutSubmit}
                  disabled={
                    isFinishing ||
                    (paymentMethod === "fiado" && (!selectedCustomerId || !isCreditAllowed())) ||
                    (paymentMethod === "dinheiro" && cashReceived !== "" && changeValue < 0)
                  }
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isFinishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar Venda
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
