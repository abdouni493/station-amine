import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  fr: {
    translation: {
      "app_name": "StationPro",
      "login": {
        "title": "Connexion StationPro",
        "email": "Adresse Email",
        "password": "Mot de passe",
        "submit": "Se connecter",
        "admin_access": "Accès Administrateur Rapide"
      },
      "dashboard": "Dashboard",
      "operations": "OPÉRATIONS",
      "brigades": "Brigades",
      "fuel_sales": "Ventes Carburant",
      "pos": "Point de Vente",
      "fuel": "CARBURANT",
      "tanks": "Cuves",
      "pumps": "Pompes",
      "tracks": "Pistes",
      "delivery_notes": "Bons de Livraison",
      "magasin": "MAGASIN",
      "products": "Produits",
      "purchases": "Achats",
      "inventory": "Inventaire",
      "clients_suppliers": "CLIENTS/FOURN.",
      "clients": "Clients",
      "suppliers": "Fournisseurs",
      "personnel": "PERSONNEL",
      "pompistes": "Pompistes",
      "brigade_chefs": "Chefs de Brigade",
      "roles_permissions": "Rôles & Permissions",
      "finances": "FINANCES",
      "expenses": "Dépenses",
      "daily_sheet": "Fiche Journalière",
      "analysis": "ANALYSE",
      "statistics": "Statistiques",
      "reports": "Rapports",
      "settings": "Paramètres",
      "logout": "Déconnexion"
    }
  },
  ar: {
    translation: {
      "app_name": "ستايشن برو",
      "login": {
        "title": "تسجيل الدخول - ستايشن برو",
        "email": "البريد الإلكتروني",
        "password": "كلمة المرور",
        "submit": "تسجيل الدخول",
        "admin_access": "دخول سريع للمشرف"
      },
      "dashboard": "لوحة القيادة",
      "operations": "العمليات",
      "brigades": "الفرق",
      "fuel_sales": "مبيعات الوقود",
      "pos": "نقطة البيع",
      "fuel": "الوقود",
      "tanks": "الخزانات",
      "pumps": "المضخات",
      "tracks": "المسارات",
      "delivery_notes": "سندات التسليم",
      "magasin": "المحل",
      "products": "المنتجات",
      "purchases": "المشتريات",
      "inventory": "المخزون",
      "clients_suppliers": "العملاء / الموردون",
      "clients": "العملاء",
      "suppliers": "الموردون",
      "personnel": "الموظفين",
      "pompistes": "عاملو المضخات",
      "brigade_chefs": "رؤساء الفرق",
      "roles_permissions": "الأدوار والصلاحيات",
      "finances": "المالية",
      "expenses": "المصاريف",
      "daily_sheet": "الورقة اليومية",
      "analysis": "التحليل",
      "statistics": "الإحصائيات",
      "reports": "التقارير",
      "settings": "الإعدادات",
      "logout": "تسجيل الخروج"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "fr",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
