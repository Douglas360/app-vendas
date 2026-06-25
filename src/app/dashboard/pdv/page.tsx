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
  Printer,
  ArrowLeft,
  ArrowRight,
  Check,
  QrCode,
  Wallet,
  Users,
  Clock,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import {
  printReceipt,
  getStoreInfo,
  type ReceiptData,
} from "@/lib/receipt";
import { sendReceiptToWhatsapp } from "@/lib/whatsapp";

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão de Débito",
  cartao_credito: "Cartão de Crédito",
  fiado: "Crediário",
};

interface CartItem extends Product {
  quantity: number;
  discount: number; // individual discount value in R$
}

interface InstallmentPreview {
  installment_number: number;
  amount: number;
  due_date: string;
}

interface OpenSaleRow {
  id: string;
  sale_number: number;
  customer_id: string | null;
  discount_percent: number;
  total: number;
  notes: string | null;
  created_at: string;
  customer?: { full_name: string } | null;
  items?: Array<{
    quantity: number;
    unit_price: number;
    discount_amount: number;
    product: Product;
  }>;
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
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);

  // Fluxo guiado no celular (1=Cliente, 2=Produtos, 3=Pagamento, 4=Revisar)
  const [mobileStep, setMobileStep] = useState(1);
  const [mobileCustomerSearch, setMobileCustomerSearch] = useState("");

  // Vendas em aberto (comandas)
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);
  const [openSales, setOpenSales] = useState<OpenSaleRow[]>([]);
  const [isOpenSalesDialogOpen, setIsOpenSalesDialogOpen] = useState(false);
  const [isSavingOpen, setIsSavingOpen] = useState(false);

  // Fiado Installment Planner State
  const [firstDueDate, setFirstDueDate] = useState<string>("");
  const [installmentFrequency, setInstallmentFrequency] = useState<"mensal" | "30_dias">("mensal");
  const [generatedInstallments, setGeneratedInstallments] = useState<InstallmentPreview[]>([]);

  // Variant Selection State
  const [selectedParentProduct, setSelectedParentProduct] = useState<Product | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [isVariantSelectionOpen, setIsVariantSelectionOpen] = useState(false);

  // Helper to get default first due date (30 days from now)
  const getDefaultFirstDueDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split("T")[0];
  };

  // Helper to regenerate installments list
  const regenerateInstallments = useCallback((count: number, firstDateStr: string, freq: "mensal" | "30_dias", totalVal: number) => {
    const countNum = count || 1;
    const baseDateStr = firstDateStr || new Date().toISOString().split("T")[0];
    const baseDate = new Date(baseDateStr + "T12:00:00");
    const newInsts: InstallmentPreview[] = [];

    const baseAmount = totalVal / countNum;
    const amounts = Array(countNum).fill(Math.floor(baseAmount * 100) / 100);
    const diff = totalVal - amounts.reduce((a, b) => a + b, 0);
    
    if (amounts.length > 0) {
      amounts[amounts.length - 1] = parseFloat((amounts[amounts.length - 1] + diff).toFixed(2));
    }

    for (let i = 0; i < countNum; i++) {
      const dueDate = new Date(baseDate);
      if (freq === "mensal") {
        dueDate.setMonth(baseDate.getMonth() + i);
      } else {
        dueDate.setDate(baseDate.getDate() + 30 * i);
      }

      newInsts.push({
        installment_number: i + 1,
        amount: amounts[i],
        due_date: dueDate.toISOString().split("T")[0],
      });
    }
    setGeneratedInstallments(newInsts);
  }, []);


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

  const loadOpenSales = useCallback(async () => {
    const { data } = await supabase
      .from("sales")
      .select(
        `id, sale_number, customer_id, discount_percent, total, notes, created_at,
         customer:customers(full_name),
         items:sale_items(quantity, unit_price, discount_amount, product:products(*))`
      )
      .eq("status", "aberta")
      .order("created_at", { ascending: false });
    setOpenSales((data as OpenSaleRow[]) || []);
  }, [supabase]);

  useEffect(() => {
    loadData();
    loadOpenSales();
  }, [loadData, loadOpenSales]);

  // Pré-seleciona o cliente quando vem da página do cliente (?cliente=<id>)
  useEffect(() => {
    if (typeof window === "undefined" || customers.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const preselectId = params.get("cliente");
    if (preselectId && customers.some((c) => c.id === preselectId)) {
      setSelectedCustomerId(preselectId);
    }
  }, [customers]);

  // Focus barcode input on mount and keep it focused
  useEffect(() => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, []);

  // Selected customer object
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  // Search filter
  const filteredProducts = products
    .filter((p) => !p.parent_id)
    .filter((prod) => {
      const matchesSearch =
        prod.name.toLowerCase().includes(search.toLowerCase()) ||
        prod.sku?.toLowerCase().includes(search.toLowerCase()) ||
        prod.barcode?.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        activeCategory === "all" || prod.category_id === activeCategory;

      return matchesSearch && matchesCategory;
    });

  // Variant helper variables
  const variantChildren = selectedParentProduct
    ? products.filter((p) => p.parent_id === selectedParentProduct.id && p.is_active)
    : [];

  const variantAttrKeys = Array.from(
    new Set(variantChildren.flatMap((c) => Object.keys(c.attributes || {})))
  );

  const isAllVariantsSelected = variantAttrKeys.every((key) => !!selectedAttributes[key]);

  const matchedVariant = isAllVariantsSelected
    ? variantChildren.find((c) =>
        variantAttrKeys.every((key) => c.attributes?.[key] === selectedAttributes[key])
      )
    : null;

  const getValuesForKey = (key: string) => {
    return Array.from(
      new Set(variantChildren.map((c) => c.attributes?.[key]).filter((v): v is string => !!v))
    );
  };

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

  const handleProductClick = (product: Product) => {
    const children = products.filter((p) => p.parent_id === product.id && p.is_active);
    if (children.length > 0) {
      setSelectedParentProduct(product);
      setSelectedAttributes({});
      setIsVariantSelectionOpen(true);
    } else {
      addToCart(product);
    }
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

  const handleUpdateInstallment = (index: number, field: keyof InstallmentPreview, value: any) => {
    setGeneratedInstallments((prev) =>
      prev.map((inst, idx) => {
        if (idx === index) {
          return {
            ...inst,
            [field]: field === "amount" ? parseFloat(value) || 0 : value,
          };
        }
        return inst;
      })
    );
  };

  const installmentsTotalSum = generatedInstallments.reduce((acc, inst) => acc + inst.amount, 0);
  const isInstallmentsSumValid = Math.abs(installmentsTotalSum - grandTotal) < 0.01;

  // Regenerate installments automatically when planner parameters change
  // (vale para o checkout do desktop e para o passo de pagamento no mobile)
  useEffect(() => {
    if ((isCheckoutOpen || mobileStep === 3) && paymentMethod === "fiado") {
      const countNum = parseInt(installmentCount) || 1;
      const dueDate = firstDueDate || getDefaultFirstDueDate();
      regenerateInstallments(countNum, dueDate, installmentFrequency, grandTotal);
    }
  }, [isCheckoutOpen, mobileStep, paymentMethod, installmentCount, firstDueDate, installmentFrequency, grandTotal, regenerateInstallments]);

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
      toast.error("Selecione um cliente para prosseguir com Crediário.");
      return;
    }
    setIsCheckoutOpen(true);
    setCashReceived("");
    setInstallmentCount("1");
    setSaleFinishedSuccess(false);

    // Initialize installments for fiado
    const defaultDate = getDefaultFirstDueDate();
    setFirstDueDate(defaultDate);
    setInstallmentFrequency("mensal");
    regenerateInstallments(1, defaultDate, "mensal", grandTotal);
  };

  // Limpa o carrinho/estado após salvar ou finalizar
  const resetCart = () => {
    setCart([]);
    setSelectedCustomerId(null);
    setSaleDiscountPercent(0);
    setNotes("");
    setOpenSaleId(null);
    setMobileStep(1);
  };

  // Salva a venda em aberto (comanda), sem finalizar
  const handleSaveOpenSale = async () => {
    if (!profile) return;
    if (cart.length === 0) {
      toast.error("Carrinho vazio!");
      return;
    }
    setIsSavingOpen(true);
    try {
      const header = {
        customer_id: selectedCustomerId || null,
        seller_id: profile.id,
        subtotal: subtotal,
        discount_amount: totalDiscount,
        discount_percent: saleDiscountPercent,
        total: grandTotal,
        status: "aberta" as const,
        notes: notes.trim() || null,
      };

      let saleId: string;
      if (openSaleId) {
        const { error } = await supabase.from("sales").update(header).eq("id", openSaleId);
        if (error) throw error;
        saleId = openSaleId;
        await supabase.from("sale_items").delete().eq("sale_id", saleId);
      } else {
        const { data, error } = await supabase
          .from("sales")
          .insert(header)
          .select()
          .single();
        if (error) throw error;
        saleId = data.id;
      }

      const itemsPayload = cart.map((item) => ({
        sale_id: saleId,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.sale_price,
        cost_price: item.cost_price,
        discount_amount: item.discount,
        total: item.quantity * item.sale_price - item.discount,
      }));
      const { error: itemsError } = await supabase.from("sale_items").insert(itemsPayload);
      if (itemsError) throw itemsError;

      toast.success("Venda salva em aberto!", {
        description: "Você pode retomá-la depois para finalizar.",
      });
      resetCart();
      loadOpenSales();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao salvar em aberto", { description: error.message });
    } finally {
      setIsSavingOpen(false);
    }
  };

  // Retoma uma venda em aberto, carregando os itens no carrinho
  const handleResumeOpenSale = (sale: OpenSaleRow) => {
    const items: CartItem[] = (sale.items || [])
      .filter((it) => it.product)
      .map((it) => ({
        ...it.product,
        sale_price: it.unit_price,
        quantity: it.quantity,
        discount: it.discount_amount,
      }));
    setCart(items);
    setSelectedCustomerId(sale.customer_id || null);
    setSaleDiscountPercent(sale.discount_percent || 0);
    setNotes(sale.notes || "");
    setOpenSaleId(sale.id);
    setIsOpenSalesDialogOpen(false);
    setMobileStep(2);
    toast.success(`Comanda #${sale.sale_number} retomada.`);
  };

  // Descarta uma venda em aberto
  const handleDiscardOpenSale = async (sale: OpenSaleRow) => {
    if (!confirm(`Descartar a comanda #${sale.sale_number}? Esta ação não pode ser desfeita.`))
      return;
    try {
      const { error } = await supabase.rpc("discard_open_sale", { p_sale_id: sale.id });
      if (error) throw error;
      if (openSaleId === sale.id) resetCart();
      toast.success("Comanda descartada.");
      loadOpenSales();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao descartar", { description: error.message });
    }
  };

  // Create Sale transaction logic
  const handleCheckoutSubmit = async () => {
    if (!profile) return;
    setIsFinishing(true);

    try {
      // 1. Validate credit limit for Fiado
      if (paymentMethod === "fiado") {
        if (!selectedCustomerId) {
          throw new Error("Cliente obrigatório para pagamento no Crediário.");
        }
        if (!isCreditAllowed()) {
          throw new Error(
            `Limite de crédito do cliente excedido. Dívida atual: R$ ${selectedCustomer?.current_debt.toFixed(
              2
            )}, Limite: R$ ${selectedCustomer?.credit_limit.toFixed(2)}, Compra: R$ ${grandTotal.toFixed(2)}`
          );
        }
      }

      // 2. Cria (ou reutiliza) o cabeçalho da venda como 'aberta'
      const header = {
        customer_id: selectedCustomerId || null,
        seller_id: profile.id,
        subtotal: subtotal,
        discount_amount: totalDiscount,
        discount_percent: saleDiscountPercent,
        total: grandTotal,
        status: "aberta" as const,
        notes: notes.trim() || null,
      };

      let saleData: { id: string };
      if (openSaleId) {
        // Finalizando uma comanda existente — atualiza e refaz os itens
        const { data, error } = await supabase
          .from("sales")
          .update(header)
          .eq("id", openSaleId)
          .select()
          .single();
        if (error) throw error;
        saleData = data;
        await supabase.from("sale_items").delete().eq("sale_id", openSaleId);
      } else {
        const { data, error: saleError } = await supabase
          .from("sales")
          .insert(header)
          .select()
          .single();
        if (saleError) throw saleError;
        saleData = data;
      }

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
          notes: paymentMethod === "fiado" ? "Compra no crediário" : null,
          paid_at: paymentMethod === "fiado" ? null : new Date().toISOString(),
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 5. If fiado, create credit installments
      if (paymentMethod === "fiado") {
        const installmentsPayload = generatedInstallments.map((inst) => ({
          payment_id: paymentData.id,
          customer_id: selectedCustomerId!,
          sale_id: saleData.id,
          installment_number: inst.installment_number,
          amount: inst.amount,
          amount_paid: 0,
          due_date: inst.due_date,
          status: "pendente",
        }));

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

      // Monta o snapshot do recibo ANTES de limpar o carrinho/cliente
      const receipt: ReceiptData = {
        store: getStoreInfo(),
        saleNumber: updatedSale.sale_number,
        date: updatedSale.created_at || new Date().toISOString(),
        seller: profile.full_name || "—",
        customer: selectedCustomer?.full_name || null,
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit || "un",
          unitPrice: item.sale_price,
          total: item.quantity * item.sale_price - item.discount,
        })),
        subtotal,
        discount: totalDiscount,
        total: grandTotal,
        paymentMethodLabel: PAYMENT_LABELS[paymentMethod] || paymentMethod,
        cashReceived:
          paymentMethod === "dinheiro" && cashReceived !== ""
            ? parseFloat(cashReceived)
            : undefined,
        change:
          paymentMethod === "dinheiro" && cashReceived !== ""
            ? Math.max(0, parseFloat(cashReceived) - grandTotal)
            : undefined,
        installments:
          paymentMethod === "fiado"
            ? generatedInstallments.map((inst) => ({
                number: inst.installment_number,
                amount: inst.amount,
                dueDate: inst.due_date,
              }))
            : undefined,
      };
      setLastReceipt(receipt);

      setLatestSaleNumber(updatedSale.sale_number);
      setSaleFinishedSuccess(true);
      setCart([]);
      setSelectedCustomerId(null);
      setSaleDiscountPercent(0);
      setNotes("");
      setOpenSaleId(null);
      loadData(); // Reload stock in catalog
      loadOpenSales(); // Atualiza a lista de comandas
      toast.success("Venda finalizada com sucesso!");

      // Abre a impressão do recibo automaticamente
      printReceipt(receipt);

      // Envia o comprovante no WhatsApp do cliente (se conectado e com telefone)
      const customerPhone = selectedCustomer?.phone;
      if (customerPhone) {
        sendReceiptToWhatsapp(supabase, receipt, customerPhone)
          .then((sent) => {
            if (sent) toast.success("Comprovante enviado no WhatsApp do cliente!");
          })
          .catch((err) =>
            toast.error("Não foi possível enviar o comprovante no WhatsApp", {
              description: err instanceof Error ? err.message : undefined,
            })
          );
      }
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

  const cartCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  // Opções de pagamento para o fluxo mobile
  const PAY_OPTIONS: { value: typeof paymentMethod; label: string; icon: typeof DollarSign }[] = [
    { value: "dinheiro", label: "Dinheiro", icon: DollarSign },
    { value: "pix", label: "PIX", icon: QrCode },
    { value: "cartao_debito", label: "Cartão Débito", icon: CreditCard },
    { value: "cartao_credito", label: "Cartão Crédito", icon: CreditCard },
    { value: "fiado", label: "Crediário", icon: Wallet },
  ];

  // Validação para liberar o botão de finalizar (mobile e desktop)
  const canFinalize =
    !isFinishing &&
    cart.length > 0 &&
    !(paymentMethod === "fiado" && (!selectedCustomerId || !isCreditAllowed() || !isInstallmentsSumValid)) &&
    !(paymentMethod === "dinheiro" && cashReceived !== "" && changeValue < 0);

  const mobileCustomers = customers.filter((c) => {
    const t = mobileCustomerSearch.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(t) ||
      (c.phone && c.phone.includes(t)) ||
      (c.cpf_cnpj && c.cpf_cnpj.includes(t))
    );
  });

  return (
    <>
      {/* ===================== FLUXO MOBILE (celular) ===================== */}
      <div className="lg:hidden">
        {saleFinishedSuccess ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Venda Finalizada!</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Venda nº <span className="font-bold text-foreground">#{latestSaleNumber}</span> gravada com sucesso.
              </p>
            </div>
            <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => lastReceipt && printReceipt(lastReceipt)}
                disabled={!lastReceipt}
                className="w-full"
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir Recibo
              </Button>
              <Button
                onClick={() => {
                  setSaleFinishedSuccess(false);
                  setMobileStep(1);
                  setPaymentMethod("dinheiro");
                  setCashReceived("");
                  setInstallmentCount("1");
                  setMobileCustomerSearch("");
                }}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Nova Venda
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Stepper */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold tracking-tight">Nova Venda</h1>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpenSalesDialogOpen(true)}
                  className="h-8 text-xs text-indigo-600"
                >
                  <Clock className="mr-1 h-3.5 w-3.5" />
                  Comandas
                  {openSales.length > 0 && (
                    <span className="ml-1 rounded-full bg-indigo-500 px-1.5 text-[10px] text-white">
                      {openSales.length}
                    </span>
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {["Cliente", "Produtos", "Pagamento", "Revisar"].map((label, i) => {
                  const n = i + 1;
                  const done = n < mobileStep;
                  const active = n === mobileStep;
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        if (n < mobileStep) setMobileStep(n);
                      }}
                      className="flex flex-col items-center gap-1"
                    >
                      <div
                        className={`h-1.5 w-full rounded-full ${
                          active || done ? "bg-indigo-500" : "bg-muted"
                        }`}
                      />
                      <span
                        className={`text-[10px] font-medium ${
                          active
                            ? "text-indigo-600 dark:text-indigo-400"
                            : done
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---- PASSO 1: CLIENTE ---- */}
            {mobileStep === 1 && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente por nome ou telefone..."
                    value={mobileCustomerSearch}
                    onChange={(e) => setMobileCustomerSearch(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>

                <button
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setMobileStep(2);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border-2 border-dashed p-4 text-left transition-colors hover:border-indigo-400"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="font-semibold">Consumidor / Balcão</p>
                      <p className="text-xs text-muted-foreground">Venda sem identificar cliente</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </button>

                <div className="space-y-2">
                  {mobileCustomers.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum cliente encontrado.
                    </p>
                  ) : (
                    mobileCustomers.map((cust) => (
                      <button
                        key={cust.id}
                        onClick={() => {
                          setSelectedCustomerId(cust.id);
                          setMobileStep(2);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition-colors hover:border-indigo-400 ${
                          selectedCustomerId === cust.id ? "border-indigo-500 bg-indigo-500/5" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{cust.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {cust.phone || "Sem telefone"}
                            {cust.current_debt > 0 && (
                              <span className="text-rose-500"> · deve R$ {cust.current_debt.toFixed(2)}</span>
                            )}
                          </p>
                        </div>
                        {selectedCustomerId === cust.id ? (
                          <Check className="h-5 w-5 shrink-0 text-indigo-500" />
                        ) : (
                          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ---- PASSO 2: PRODUTOS ---- */}
            {mobileStep === 2 && (
              <div className="space-y-3 pb-24">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-semibold">
                    {selectedCustomer?.full_name || "Consumidor / Balcão"}
                  </span>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  <Button
                    variant={activeCategory === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveCategory("all")}
                    className="shrink-0 rounded-full px-4 text-xs font-semibold"
                  >
                    Todos
                  </Button>
                  {categories.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={activeCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveCategory(cat.id)}
                      className="shrink-0 rounded-full px-4 text-xs font-semibold"
                    >
                      {cat.name}
                    </Button>
                  ))}
                </div>

                {isLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredProducts.map((prod) => {
                      const children = products.filter(
                        (p) => p.parent_id === prod.id && p.is_active
                      );
                      const hasVariants = children.length > 0;
                      const totalStock = hasVariants
                        ? children.reduce((acc, c) => acc + c.stock_quantity, 0)
                        : prod.stock_quantity;
                      const minPrice = hasVariants
                        ? Math.min(...children.map((c) => c.sale_price))
                        : prod.sale_price;
                      const outOfStock = totalStock <= 0;
                      return (
                        <button
                          key={prod.id}
                          disabled={outOfStock}
                          onClick={() => handleProductClick(prod)}
                          className={`flex flex-col rounded-xl border bg-card p-3 text-left shadow-sm transition-all ${
                            outOfStock
                              ? "cursor-not-allowed bg-muted/40 opacity-50"
                              : "active:scale-[0.98] hover:border-indigo-500"
                          }`}
                        >
                          <h4 className="line-clamp-2 text-sm font-semibold leading-snug">
                            {prod.name}
                          </h4>
                          <div className="mt-2 flex items-end justify-between">
                            <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                              R$ {minPrice.toFixed(2)}
                              {hasVariants && <span className="text-[10px]">+</span>}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {totalStock} un
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Carrinho */}
                {cart.length > 0 && (
                  <div className="space-y-2 rounded-xl border p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      Carrinho ({cartCount})
                    </p>
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="space-y-2 border-b pb-2.5 text-sm last:border-0 last:pb-0"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              R$ {item.sale_price.toFixed(2)} / un
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => updateQuantity(item.id, -1)}
                              className="h-8 w-8"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-7 text-center text-sm font-bold">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => updateQuantity(item.id, 1)}
                              className="h-8 w-8"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="ml-1 p-1 text-muted-foreground hover:text-rose-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Label
                              htmlFor={`m-disc-${item.id}`}
                              className="text-[11px] text-muted-foreground"
                            >
                              Desconto R$
                            </Label>
                            <Input
                              id={`m-disc-${item.id}`}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              placeholder="0,00"
                              value={item.discount || ""}
                              onChange={(e) =>
                                updateItemDiscount(item.id, parseFloat(e.target.value) || 0)
                              }
                              className="h-8 w-24 text-xs"
                            />
                          </div>
                          <span className="font-bold">
                            R$ {(item.quantity * item.sale_price - item.discount).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Barra de ação inferior */}
                <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
                  <div className="mx-auto flex max-w-lg items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setMobileStep(1)}
                      className="h-12 px-3"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSaveOpenSale}
                      disabled={cart.length === 0 || isSavingOpen}
                      className="h-12 px-3"
                      title="Salvar em aberto"
                    >
                      {isSavingOpen ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => setMobileStep(3)}
                      disabled={cart.length === 0}
                      className="h-12 flex-1 bg-indigo-600 text-base font-bold text-white hover:bg-indigo-700"
                    >
                      <span>Pagamento</span>
                      <span className="ml-2 rounded-md bg-white/20 px-2 py-0.5 text-sm">
                        R$ {grandTotal.toFixed(2)}
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ---- PASSO 3: PAGAMENTO ---- */}
            {mobileStep === 3 && (
              <div className="space-y-4 pb-24">
                <div className="flex items-center justify-between rounded-xl border border-indigo-500/10 bg-indigo-500/5 p-4">
                  <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                    Total
                  </span>
                  <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                    R$ {grandTotal.toFixed(2)}
                  </span>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold">Forma de pagamento</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PAY_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const selected = paymentMethod === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setPaymentMethod(opt.value);
                            if (opt.value === "fiado" && !firstDueDate) {
                              setFirstDueDate(getDefaultFirstDueDate());
                            }
                          }}
                          className={`flex items-center gap-2 rounded-xl border-2 p-3.5 text-left transition-colors ${
                            selected
                              ? "border-indigo-500 bg-indigo-500/5"
                              : "border-border hover:border-indigo-300"
                          }`}
                        >
                          <Icon
                            className={`h-5 w-5 shrink-0 ${
                              selected ? "text-indigo-500" : "text-muted-foreground"
                            }`}
                          />
                          <span className="text-sm font-semibold">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dinheiro: troco */}
                {paymentMethod === "dinheiro" && (
                  <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                    <Label htmlFor="m-cash">Valor recebido (R$)</Label>
                    <Input
                      id="m-cash"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="Ex: 50.00"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="h-11"
                    />
                    {cashReceived !== "" && (
                      <div className="flex justify-between border-t pt-2 text-sm">
                        <span className="text-muted-foreground">Troco</span>
                        <span
                          className={`text-lg font-extrabold ${
                            changeValue >= 0 ? "text-emerald-500" : "text-rose-500"
                          }`}
                        >
                          {changeValue >= 0
                            ? `R$ ${changeValue.toFixed(2)}`
                            : `Falta R$ ${Math.abs(changeValue).toFixed(2)}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Fiado */}
                {paymentMethod === "fiado" && (
                  <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                    {!selectedCustomerId ? (
                      <div className="flex items-center gap-2 text-sm text-rose-500">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                          O crediário precisa de um cliente.{" "}
                          <button
                            onClick={() => setMobileStep(1)}
                            className="font-bold underline"
                          >
                            Selecionar cliente
                          </button>
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="m-inst">Parcelas</Label>
                            <Select value={installmentCount} onValueChange={setInstallmentCount}>
                              <SelectTrigger id="m-inst" className="h-11">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["1", "2", "3", "4", "6", "12"].map((n) => (
                                  <SelectItem key={n} value={n}>
                                    {n}x de R$ {(grandTotal / parseInt(n)).toFixed(2)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="m-freq">Frequência</Label>
                            <Select
                              value={installmentFrequency}
                              onValueChange={(val: "mensal" | "30_dias") =>
                                setInstallmentFrequency(val)
                              }
                            >
                              <SelectTrigger id="m-freq" className="h-11">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mensal">Mensal (mesmo dia)</SelectItem>
                                <SelectItem value="30_dias">A cada 30 dias</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="m-due">Data do 1º vencimento</Label>
                          <Input
                            id="m-due"
                            type="date"
                            value={firstDueDate}
                            onChange={(e) => setFirstDueDate(e.target.value)}
                            className="h-11"
                          />
                        </div>

                        {/* Parcelas — valor e vencimento editáveis */}
                        {generatedInstallments.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground">
                              Parcelas (ajuste valor e vencimento)
                            </Label>
                            <div className="space-y-2">
                              {generatedInstallments.map((inst, index) => (
                                <div
                                  key={inst.installment_number}
                                  className="flex items-center gap-2"
                                >
                                  <span className="w-7 shrink-0 text-xs font-bold text-muted-foreground">
                                    {inst.installment_number}ª
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">R$</span>
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      step="0.01"
                                      value={inst.amount}
                                      onChange={(e) =>
                                        handleUpdateInstallment(index, "amount", e.target.value)
                                      }
                                      className="h-10 w-20 text-sm"
                                    />
                                  </div>
                                  <Input
                                    type="date"
                                    value={inst.due_date}
                                    onChange={(e) =>
                                      handleUpdateInstallment(index, "due_date", e.target.value)
                                    }
                                    className="h-10 flex-1 text-sm"
                                  />
                                </div>
                              ))}
                            </div>
                            {!isInstallmentsSumValid && (
                              <div className="flex items-center gap-1.5 rounded border border-rose-500/10 bg-rose-500/5 p-2 text-[11px] font-semibold text-rose-500">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span>
                                  As parcelas somam R$ {installmentsTotalSum.toFixed(2)} (falta R${" "}
                                  {(grandTotal - installmentsTotalSum).toFixed(2)}). Ajuste para
                                  prosseguir.
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {selectedCustomer && (
                          <div
                            className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs font-medium ${
                              isCreditAllowed()
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                                : "border-rose-500/20 bg-rose-500/10 text-rose-700"
                            }`}
                          >
                            {isCreditAllowed() ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                                <span>
                                  Autorizado · limite livre R${" "}
                                  {(selectedCustomer.credit_limit - selectedCustomer.current_debt).toFixed(2)}
                                </span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                                <span>
                                  Limite excedido em R${" "}
                                  {(selectedCustomer.current_debt + grandTotal - selectedCustomer.credit_limit).toFixed(2)}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Desconto rápido */}
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span className="flex items-center gap-1.5 text-sm">
                    <Percent className="h-4 w-4 text-indigo-500" />
                    Desconto (%)
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={saleDiscountPercent || ""}
                    onChange={(e) =>
                      setSaleDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))
                    }
                    className="h-10 w-20 text-right"
                  />
                </div>

                <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
                  <div className="mx-auto flex max-w-lg items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setMobileStep(2)}
                      className="h-12 px-4"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => setMobileStep(4)}
                      disabled={
                        paymentMethod === "fiado" &&
                        (!selectedCustomerId || !isCreditAllowed() || !isInstallmentsSumValid)
                      }
                      className="h-12 flex-1 bg-indigo-600 text-base font-bold text-white hover:bg-indigo-700"
                    >
                      Revisar
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ---- PASSO 4: REVISAR ---- */}
            {mobileStep === 4 && (
              <div className="space-y-4 pb-24">
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cliente</span>
                    <span className="font-semibold">
                      {selectedCustomer?.full_name || "Consumidor / Balcão"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pagamento</span>
                    <span className="font-semibold">
                      {PAY_OPTIONS.find((o) => o.value === paymentMethod)?.label}
                      {paymentMethod === "fiado" && ` · ${installmentCount}x`}
                    </span>
                  </div>
                  {paymentMethod === "dinheiro" && cashReceived !== "" && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Troco</span>
                      <span className="font-semibold">R$ {Math.max(0, changeValue).toFixed(2)}</span>
                    </div>
                  )}

                  <div className="border-t pt-3">
                    <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
                      Itens ({cartCount})
                    </p>
                    <div className="space-y-1.5">
                      {cart.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="min-w-0 truncate pr-2">
                            {item.quantity}x {item.name}
                          </span>
                          <span className="shrink-0 font-medium">
                            R$ {(item.quantity * item.sale_price - item.discount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {totalDiscount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Desconto</span>
                      <span>- R$ {totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-base font-bold">Total</span>
                    <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      R$ {grandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                <Input
                  placeholder="Observações da venda (opcional)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-11"
                />

                <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
                  <div className="mx-auto flex max-w-lg items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setMobileStep(3)}
                      className="h-12 px-4"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={handleCheckoutSubmit}
                      disabled={!canFinalize}
                      className="h-12 flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-base font-bold text-white hover:from-indigo-600 hover:to-purple-700"
                    >
                      {isFinishing ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-5 w-5" />
                      )}
                      Finalizar Venda
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================== LAYOUT DESKTOP ===================== */}
      <div className="hidden gap-6 lg:flex lg:h-[calc(100vh-6.5rem)] lg:flex-row">
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
                const children = products.filter((p) => p.parent_id === prod.id && p.is_active);
                const hasVariants = children.length > 0;

                const totalStock = hasVariants
                  ? children.reduce((acc, c) => acc + c.stock_quantity, 0)
                  : prod.stock_quantity;
                const minPrice = hasVariants
                  ? Math.min(...children.map((c) => c.sale_price))
                  : prod.sale_price;
                const maxPrice = hasVariants
                  ? Math.max(...children.map((c) => c.sale_price))
                  : prod.sale_price;
                const outOfStock = totalStock <= 0;

                return (
                  <button
                    key={prod.id}
                    disabled={outOfStock}
                    onClick={() => handleProductClick(prod)}
                    className={`flex flex-col text-left border bg-card rounded-xl p-3 shadow-sm transition-all duration-200 group relative ${
                      outOfStock
                        ? "opacity-50 cursor-not-allowed bg-muted/40"
                        : "hover:border-indigo-500 hover:shadow-md hover:scale-[1.02]"
                    }`}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {prod.sku || "Sem SKU"}
                        </span>
                        {hasVariants && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1 border-indigo-400 text-indigo-500 dark:text-indigo-400 font-semibold shrink-0">
                            Grade
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-semibold text-sm line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                        {prod.name}
                      </h4>
                    </div>

                    <div className="flex justify-between items-end mt-4 pt-2 border-t w-full">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground uppercase block font-bold">Venda</span>
                        <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                          {hasVariants && minPrice !== maxPrice ? (
                            <span className="text-xs">R$ {minPrice.toFixed(2)} - {maxPrice.toFixed(2)}</span>
                          ) : (
                            <span>R$ {minPrice.toFixed(2)}</span>
                          )}
                        </span>
                      </div>
                      <Badge
                        variant={totalStock <= prod.min_stock ? "destructive" : "secondary"}
                        className="text-[10px] py-0.5 font-bold"
                      >
                        Estoque: {totalStock}
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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpenSalesDialogOpen(true)}
              className="text-xs text-indigo-600 hover:bg-indigo-500/10"
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              Comandas
              {openSales.length > 0 && (
                <span className="ml-1 rounded-full bg-indigo-500 px-1.5 text-[10px] text-white">
                  {openSales.length}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetCart}
              disabled={cart.length === 0}
              className="text-muted-foreground text-xs hover:text-rose-500"
            >
              Limpar
            </Button>
          </div>
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
            {openSaleId && (
              <p className="text-center text-[11px] font-semibold text-amber-600">
                Editando comanda em aberto
              </p>
            )}
            <Input
              placeholder="Observações da venda..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 text-xs placeholder:text-muted-foreground/60"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSaveOpenSale}
                disabled={cart.length === 0 || isSavingOpen}
                className="h-11 flex-1 font-semibold"
              >
                {isSavingOpen ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                Em aberto
              </Button>
              <Button
                onClick={handleOpenCheckout}
                disabled={cart.length === 0}
                className="h-11 flex-[2] bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold shadow-md transition-all duration-200"
              >
                Registrar Pagamento
              </Button>
            </div>
          </div>
        </div>
      </Card>
      </div>
      {/* ===================== DIÁLOGOS (compartilhados) ===================== */}

      {/* Vendas em aberto (comandas) */}
      <Dialog open={isOpenSalesDialogOpen} onOpenChange={setIsOpenSalesDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vendas em Aberto</DialogTitle>
            <DialogDescription>
              Comandas salvas sem finalizar. Retome para concluir ou descarte.
            </DialogDescription>
          </DialogHeader>

          {openSales.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma venda em aberto.
            </p>
          ) : (
            <div className="space-y-2">
              {openSales.map((s) => {
                const itemCount = (s.items || []).reduce((a, i) => a + Number(i.quantity), 0);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <button
                      onClick={() => handleResumeOpenSale(s)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate font-semibold">
                        #{s.sale_number} ·{" "}
                        {s.customer?.full_name || "Cliente Balcão"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {itemCount} item(ns) · R$ {Number(s.total).toFixed(2)} ·{" "}
                        {new Date(s.created_at).toLocaleString("pt-BR")}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleResumeOpenSale(s)}
                        className="h-8 bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        Retomar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDiscardOpenSale(s)}
                        title="Descartar"
                        className="h-8 w-8 text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>


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
              <div className="mt-4 flex w-full flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => lastReceipt && printReceipt(lastReceipt)}
                  disabled={!lastReceipt}
                  className="w-full"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir Recibo
                </Button>
                <Button onClick={() => setIsCheckoutOpen(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full">
                  Nova Venda
                </Button>
              </div>
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
                      <SelectItem value="fiado">Crediário</SelectItem>
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
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1 font-semibold">
                            <Label htmlFor="installments-fiado">Parcelas</Label>
                            <Select value={installmentCount} onValueChange={setInstallmentCount}>
                              <SelectTrigger id="installments-fiado" className="h-9">
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
                          <div className="space-y-1 font-semibold">
                            <Label htmlFor="fiado-frequency">Frequência</Label>
                            <Select
                              value={installmentFrequency}
                              onValueChange={(val: any) => setInstallmentFrequency(val)}
                            >
                              <SelectTrigger id="fiado-frequency" className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mensal">Mensal (Mesmo dia)</SelectItem>
                                <SelectItem value="30_dias">A cada 30 dias</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="first-due-date">Data do 1º Vencimento</Label>
                          <Input
                            id="first-due-date"
                            type="date"
                            value={firstDueDate}
                            onChange={(e) => setFirstDueDate(e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>

                        {/* Detalhamento das parcelas */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Detalhamento das Parcelas
                          </Label>
                          <ScrollArea className="h-[140px] border rounded-lg p-2 bg-background">
                            <div className="space-y-2">
                              {generatedInstallments.map((inst, index) => (
                                <div key={index} className="flex gap-2 items-center justify-between text-xs border-b pb-2 last:border-b-0 last:pb-0">
                                  <span className="font-bold text-muted-foreground w-12 shrink-0">
                                    {inst.installment_number}ª Parc.
                                  </span>
                                  <div className="flex gap-1 items-center flex-1">
                                    <span className="text-muted-foreground">R$</span>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={inst.amount}
                                      onChange={(e) => handleUpdateInstallment(index, "amount", e.target.value)}
                                      className="h-7 w-20 text-xs px-1.5 font-semibold text-right"
                                    />
                                  </div>
                                  <Input
                                    type="date"
                                    value={inst.due_date}
                                    onChange={(e) => handleUpdateInstallment(index, "due_date", e.target.value)}
                                    className="h-7 w-28 text-xs px-1.5 font-mono"
                                  />
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>

                        {/* Sum Validation message */}
                        {!isInstallmentsSumValid && (
                          <div className="text-[11px] text-rose-500 font-semibold flex items-center gap-1.5 bg-rose-500/5 p-2 rounded border border-rose-500/10">
                            <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
                            <span>
                              As parcelas somam R$ {installmentsTotalSum.toFixed(2)} (Falta R$ {(grandTotal - installmentsTotalSum).toFixed(2)}). Ajuste para prosseguir.
                            </span>
                          </div>
                        )}

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
                    (paymentMethod === "fiado" && (!selectedCustomerId || !isCreditAllowed() || !isInstallmentsSumValid)) ||
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

      {/* Variant Selection Dialog */}
      <Dialog open={isVariantSelectionOpen} onOpenChange={setIsVariantSelectionOpen}>
        <DialogContent className="max-w-md bg-card border border-muted shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <span className="bg-indigo-500/10 text-indigo-500 p-1.5 rounded-lg">
                <ShoppingCart className="h-5 w-5" />
              </span>
              Selecionar Variação
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm">
              Escolha as características do produto para adicionar ao carrinho.
            </DialogDescription>
          </DialogHeader>

          {selectedParentProduct && (
            <div className="space-y-6 py-4">
              {/* Product Info Summary */}
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-muted/30 border">
                <span className="text-xs text-muted-foreground font-semibold">Produto Principal</span>
                <span className="font-bold text-base text-foreground">{selectedParentProduct.name}</span>
                <span className="text-xs text-muted-foreground">SKU Base: {selectedParentProduct.sku || "Sem SKU"}</span>
              </div>

              {/* Attributes Selectors */}
              <div className="space-y-4">
                {variantAttrKeys.map((key) => {
                  const values = getValuesForKey(key);
                  const selectedVal = selectedAttributes[key];
                  return (
                    <div key={key} className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {values.map((val) => {
                          const isSelected = selectedVal === val;
                          return (
                            <Button
                              key={val}
                              type="button"
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setSelectedAttributes((prev) => ({
                                  ...prev,
                                  [key]: val,
                                }));
                              }}
                              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                                isSelected
                                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow"
                                  : "hover:bg-muted"
                              }`}
                            >
                              {val}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selection Status / Matched Variant Info */}
              {variantAttrKeys.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  {matchedVariant ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-indigo-500/5 dark:bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/10">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Disponível</span>
                          <span className="text-sm font-semibold">
                            SKU: {matchedVariant.sku || "Sem SKU"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground block font-bold">Preço</span>
                          <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">
                            R$ {matchedVariant.sale_price.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-sm px-1">
                        <span className="text-muted-foreground font-semibold">Estoque desta variação:</span>
                        <Badge
                          variant={matchedVariant.stock_quantity <= matchedVariant.min_stock ? "destructive" : "secondary"}
                          className="font-bold text-xs"
                        >
                          {matchedVariant.stock_quantity} unidades
                        </Badge>
                      </div>

                      {matchedVariant.stock_quantity <= 0 && (
                        <div className="text-xs text-amber-500 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10 flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Esta variação está sem estoque.</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center p-4 bg-muted/20 border border-dashed rounded-xl text-muted-foreground text-xs">
                      {Object.keys(selectedAttributes).length === 0 ? (
                        <span>Selecione as opções acima para ver preço e estoque.</span>
                      ) : (
                        <span>Esta combinação de atributos não está disponível.</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsVariantSelectionOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!matchedVariant}
              onClick={() => {
                if (matchedVariant) {
                  addToCart(matchedVariant);
                  setIsVariantSelectionOpen(false);
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md transition-colors"
            >
              Adicionar ao Carrinho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
