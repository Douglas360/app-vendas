"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import {
  User,
  Settings,
  Database,
  Sun,
  Moon,
  Sparkles,
  Loader2,
  CheckCircle,
  Store,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getStoreInfo,
  saveStoreInfo,
  printReceipt,
  type StoreInfo,
} from "@/lib/receipt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ConfiguracoesPage() {
  const { profile, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);
  const supabase = createClient();

  const [geminiKey, setGeminiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_vendas_gemini_key") || "";
    }
    return "";
  });
  const [geminiModel, setGeminiModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_vendas_gemini_model") || "gemini-2.5-flash";
    }
    return "gemini-2.5-flash";
  });
  const [showKey, setShowKey] = useState(false);

  // Dados da loja (para o cabeçalho do recibo)
  const [store, setStore] = useState<StoreInfo>(() => getStoreInfo());

  function handleSaveAISettings() {
    localStorage.setItem("app_vendas_gemini_key", geminiKey.trim());
    localStorage.setItem("app_vendas_gemini_model", geminiModel);
    toast.success("Configurações de IA salvas com sucesso!");
  }

  function handleSaveStore() {
    if (!store.name.trim()) {
      toast.error("Informe o nome da loja.");
      return;
    }
    saveStoreInfo(store);
    toast.success("Dados da loja salvos!", {
      description: "Aparecerão no cabeçalho dos recibos.",
    });
  }

  function handlePreviewReceipt() {
    saveStoreInfo(store);
    printReceipt({
      store,
      saleNumber: 0,
      date: new Date().toISOString(),
      seller: profile?.full_name || "Vendedor",
      customer: "Cliente Exemplo",
      items: [
        { name: "Produto de Exemplo A", quantity: 2, unit: "un", unitPrice: 4.5, total: 9.0 },
        { name: "Produto de Exemplo B", quantity: 1, unit: "un", unitPrice: 25.9, total: 25.9 },
      ],
      subtotal: 34.9,
      discount: 0,
      total: 34.9,
      paymentMethodLabel: "Dinheiro",
      cashReceived: 50,
      change: 15.1,
    });
  }

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase() || "??";

  async function handleSeedData() {
    setIsSeeding(true);
    setSeedSuccess(false);

    try {
      if (!profile || profile.role !== "admin") {
        toast.error("Permissão negada", {
          description: "Somente administradores podem semear dados de teste.",
        });
        setIsSeeding(false);
        return;
      }

      toast.info("Semeando categorias de produtos...");
      
      const categoriesData = [
        { name: "Bebidas", description: "Refrigerantes, sucos, cervejas e águas", color: "#3b82f6" },
        { name: "Alimentos", description: "Mantimentos, arroz, feijão, massas", color: "#f59e0b" },
        { name: "Higiene Pessoal", description: "Sabonetes, shampoo, creme dental", color: "#10b981" },
        { name: "Limpeza", description: "Detergentes, desinfetantes, sabão em pó", color: "#ec4899" },
      ];

      // Insert categories and select them back to map products
      const { data: insertedCategories, error: catError } = await supabase
        .from("product_categories")
        .upsert(categoriesData, { onConflict: "name" })
        .select();

      if (catError) throw catError;

      const catMap: Record<string, string> = {};
      insertedCategories?.forEach((cat: any) => {
        catMap[cat.name] = cat.id;
      });

      toast.info("Semeando cadastro de produtos...");

      const productsData = [
        {
          name: "Coca-Cola Lata 350ml",
          sku: "BEB-COCA-350",
          barcode: "7891234560012",
          category_id: catMap["Bebidas"],
          cost_price: 2.20,
          sale_price: 4.50,
          stock_quantity: 50,
          min_stock: 10,
          unit: "un",
        },
        {
          name: "Arroz Tipo 1 5kg Tio João",
          sku: "ALI-ARROZ-5K",
          barcode: "7891234560029",
          category_id: catMap["Alimentos"],
          cost_price: 18.50,
          sale_price: 25.90,
          stock_quantity: 20,
          min_stock: 5,
          unit: "un",
        },
        {
          name: "Feijão Carioca Kicaldo 1kg",
          sku: "ALI-FEIJAO-1K",
          barcode: "7891234560036",
          category_id: catMap["Alimentos"],
          cost_price: 4.80,
          sale_price: 7.20,
          stock_quantity: 30,
          min_stock: 5,
          unit: "un",
        },
        {
          name: "Sabonete Dove Original 90g",
          sku: "HIG-SAB-DOVE",
          barcode: "7891234560043",
          category_id: catMap["Higiene Pessoal"],
          cost_price: 1.90,
          sale_price: 3.50,
          stock_quantity: 45,
          min_stock: 8,
          unit: "un",
        },
        {
          name: "Detergente Líquido Ypê Neutro 500ml",
          sku: "LIM-DET-YPE",
          barcode: "7891234560050",
          category_id: catMap["Limpeza"],
          cost_price: 1.20,
          sale_price: 2.40,
          stock_quantity: 60,
          min_stock: 12,
          unit: "un",
        },
        {
          name: "Cerveja Heineken Long Neck 330ml",
          sku: "BEB-HEIN-330",
          barcode: "7891234560067",
          category_id: catMap["Bebidas"],
          cost_price: 3.80,
          sale_price: 6.90,
          stock_quantity: 8, // Estoque baixo!
          min_stock: 12,
          unit: "un",
        },
      ];

      const { error: prodError } = await supabase
        .from("products")
        .upsert(productsData, { onConflict: "sku" });

      if (prodError) throw prodError;

      toast.info("Semeando carteira de clientes...");

      const customersData = [
        {
          full_name: "Douglas Duarte",
          email: "douglas@example.com",
          phone: "(11) 99999-8888",
          cpf_cnpj: "123.456.789-00",
          address_street: "Avenida Paulista",
          address_number: "1000",
          address_neighborhood: "Bela Vista",
          address_city: "São Paulo",
          address_state: "SP",
          address_zip: "01310-100",
          credit_limit: 1000.00,
          created_by: profile.id,
        },
        {
          full_name: "Maria Silva Santos",
          email: "maria.silva@example.com",
          phone: "(11) 98888-7777",
          cpf_cnpj: "234.567.890-12",
          address_street: "Rua das Flores",
          address_number: "250",
          address_neighborhood: "Jardins",
          address_city: "São Paulo",
          address_state: "SP",
          address_zip: "01400-000",
          credit_limit: 500.00,
          created_by: profile.id,
        },
        {
          full_name: "João Santos de Oliveira",
          email: "joao.santos@example.com",
          phone: "(21) 97777-6666",
          cpf_cnpj: "345.678.901-23",
          address_street: "Avenida Atlântica",
          address_number: "500",
          address_neighborhood: "Copacabana",
          address_city: "Rio de Janeiro",
          address_state: "RJ",
          address_zip: "22020-002",
          credit_limit: 300.00,
          created_by: profile.id,
        },
        {
          full_name: "Ana Julia de Souza",
          email: "ana.julia@example.com",
          phone: "(31) 96666-5555",
          cpf_cnpj: "456.789.012-34",
          address_street: "Rua da Bahia",
          address_number: "1200",
          address_neighborhood: "Centro",
          address_city: "Belo Horizonte",
          address_state: "MG",
          address_zip: "30160-011",
          credit_limit: 1200.00,
          created_by: profile.id,
        },
      ];

      const { error: custError } = await supabase
        .from("customers")
        .upsert(customersData, { onConflict: "cpf_cnpj" });

      if (custError) throw custError;

      setSeedSuccess(true);
      toast.success("Dados semeados com sucesso!", {
        description: "Categorias, produtos e clientes criados para demonstração.",
      });
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao semear dados", {
        description: error.message || "Erro inesperado.",
      });
    } finally {
      setIsSeeding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie suas preferências de usuário, perfil e dados de demonstração.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Card */}
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="h-16 w-16 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
              <AvatarFallback className="text-xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-xl">{profile?.full_name}</CardTitle>
              <CardDescription>{user?.email}</CardDescription>
              <div className="flex gap-2 mt-1">
                <Badge variant={profile?.role === "admin" ? "default" : "secondary"} className="capitalize">
                  {profile?.role}
                </Badge>
                {profile?.is_active && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    Ativo
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block">Telefone</span>
                <span className="font-medium">{profile?.phone || "Não informado"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Cadastrado em</span>
                <span className="font-medium">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR") : "N/A"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Theme Preferences Card */}
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Preferências do App</CardTitle>
              <CardDescription>Configure a interface visual do sistema</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium block text-sm">Modo Escuro / Claro</span>
                <span className="text-muted-foreground text-xs">Alterna entre cores escuras e claras</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setTheme("light")}
                  className="h-9 w-9"
                >
                  <Sun className="h-4 w-4" />
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setTheme("dark")}
                  className="h-9 w-9"
                >
                  <Moon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Configurations Card */}
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 dark:bg-purple-500/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Inteligência Artificial (IA)</CardTitle>
              <CardDescription>Configure a integração com o Google Gemini</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <label htmlFor="gemini-key" className="text-sm font-semibold block">Chave de API do Gemini</label>
              <div className="relative">
                <input
                  id="gemini-key"
                  type={showKey ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Cole sua API Key do Gemini (AI Studio)"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold"
                >
                  {showKey ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Sua chave fica salva localmente no seu navegador e não é enviada para nenhum servidor externo além da API oficial do Google.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="gemini-model" className="text-sm font-semibold block">Modelo de IA</label>
              <Select value={geminiModel} onValueChange={setGeminiModel}>
                <SelectTrigger id="gemini-model" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (Recomendado)</SelectItem>
                  <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Mais leve)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSaveAISettings}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium shadow-sm"
            >
              Salvar Configurações de IA
            </Button>
          </CardContent>
        </Card>

        {/* Store / Receipt Card */}
        <Card className="border shadow-md md:col-span-2">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Dados da Loja (Recibo)</CardTitle>
              <CardDescription>
                Informações exibidas no cabeçalho e rodapé do cupom de venda
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-name">Nome da Loja *</Label>
                <Input
                  id="store-name"
                  value={store.name}
                  onChange={(e) => setStore({ ...store, name: e.target.value })}
                  placeholder="Minha Loja"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-cnpj">CNPJ / CPF</Label>
                <Input
                  id="store-cnpj"
                  value={store.cnpj || ""}
                  onChange={(e) => setStore({ ...store, cnpj: e.target.value })}
                  placeholder="00.000.000/0001-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-phone">Telefone</Label>
                <Input
                  id="store-phone"
                  value={store.phone || ""}
                  onChange={(e) => setStore({ ...store, phone: e.target.value })}
                  placeholder="(11) 99999-8888"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-address">Endereço</Label>
                <Input
                  id="store-address"
                  value={store.address || ""}
                  onChange={(e) => setStore({ ...store, address: e.target.value })}
                  placeholder="Rua Exemplo, 123 - Centro"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-footer">Mensagem do Rodapé</Label>
                <Input
                  id="store-footer"
                  value={store.footer || ""}
                  onChange={(e) => setStore({ ...store, footer: e.target.value })}
                  placeholder="Obrigado pela preferência! Volte sempre."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-paper">Largura do Cupom</Label>
                <Select
                  value={store.paperWidth || "80"}
                  onValueChange={(val) => setStore({ ...store, paperWidth: val })}
                >
                  <SelectTrigger id="store-paper" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80">80mm (padrão térmica)</SelectItem>
                    <SelectItem value="58">58mm (mini impressora)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  No diálogo de impressão, selecione papel “80mm/Rolo” (ou “Salvar como PDF”) para sair no tamanho de cupom.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSaveStore}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                Salvar Dados da Loja
              </Button>
              <Button variant="outline" onClick={handlePreviewReceipt}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir Recibo de Exemplo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Seed Data Card */}
        {profile?.role === "admin" && (
          <Card className="border shadow-md md:col-span-2 bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 dark:bg-purple-500/20">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Dados de Demonstração (Seed)
                  <Sparkles className="h-4 w-4 text-purple-500 animate-pulse" />
                </CardTitle>
                <CardDescription>
                  Preencha o banco de dados com categorias, produtos e clientes padrão para testar o sistema.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4 border-t flex flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground max-w-2xl">
                Esta ação criará categorias (Alimentos, Bebidas, Higiene, Limpeza), clientes teste com limites
                de crédito pré-definidos (Douglas Duarte, Maria Silva, etc.) e diversos produtos para abastecer
                seu estoque inicial e testar vendas. Se houver conflito de dados (SKU ou CPF repetidos), eles serão atualizados.
              </p>
              
              <div className="flex items-center gap-4 w-full justify-between">
                <Button
                  onClick={handleSeedData}
                  disabled={isSeeding}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium shadow-md transition-all duration-200"
                >
                  {isSeeding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Semeando Banco...
                    </>
                  ) : seedSuccess ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4 text-emerald-200" />
                      Banco Semeado!
                    </>
                  ) : (
                    "Semear Dados de Teste"
                  )}
                </Button>
                
                {seedSuccess && (
                  <span className="text-emerald-500 text-sm font-medium flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4" />
                    Seu banco de dados agora está pronto para testes. Acesse o PDV ou as páginas de listagem.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
