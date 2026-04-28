"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { User, Bell, CheckCircle, XCircle, Loader2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

interface MetaAccountCredentials {
  id: string;
  name: string;
  appId: string;
  appSecret?: string;
  accessToken: string;
  adAccountId?: string;
  adAccountName?: string;
  currency?: string;
}

function SettingsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [metaAccounts, setMetaAccounts] = useState<MetaAccountCredentials[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  
  const [newAccount, setNewAccount] = useState({
    name: "",
    appId: "",
    appSecret: "",
    accessToken: "",
  });

  const loadAccounts = useCallback(() => {
    const stored = localStorage.getItem('meta_accounts');
    if (stored) {
      try {
        const accounts = JSON.parse(stored);
        setMetaAccounts(accounts);
      } catch (e) {
        console.error("Error parsing stored accounts:", e);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();

    const error = searchParams.get("meta_error");
    if (error) {
      setMetaError(decodeURIComponent(error));
      const url = new URL(window.location.href);
      url.searchParams.delete('meta_error');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [loadAccounts, searchParams]);

  const handleAddAccount = async () => {
    if (!newAccount.name || !newAccount.appId || !newAccount.accessToken) {
      setMetaError("Name, App ID, and Access Token are required");
      return;
    }

    setAddingAccount(true);
    setMetaError(null);

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?` +
        `access_token=${newAccount.accessToken}&` +
        `fields=id,name,account_id,account_status,currency`
      );
      
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      const accountId = `acc_${Date.now()}`;
      const newAcc: MetaAccountCredentials = {
        id: accountId,
        name: newAccount.name,
        appId: newAccount.appId,
        appSecret: newAccount.appSecret,
        accessToken: newAccount.accessToken,
        currency: data.data?.[0]?.currency || "INR",
      };

      if (data.data && data.data.length > 0) {
        newAcc.adAccountId = data.data[0].id;
        newAcc.adAccountName = data.data[0].name;
      }

      const updatedAccounts = [...metaAccounts, newAcc];
      localStorage.setItem('meta_accounts', JSON.stringify(updatedAccounts));
      setMetaAccounts(updatedAccounts);

      setShowAddForm(false);
      setNewAccount({ name: "", appId: "", appSecret: "", accessToken: "" });
    } catch (error: any) {
      setMetaError(error.message || "Failed to add account. Check your credentials.");
    } finally {
      setAddingAccount(false);
    }
  };

  const handleRemoveAccount = (accountId: string) => {
    const updatedAccounts = metaAccounts.filter(acc => acc.id !== accountId);
    localStorage.setItem('meta_accounts', JSON.stringify(updatedAccounts));
    setMetaAccounts(updatedAccounts);
  };

  const handleSelectAccount = (accountId: string) => {
    localStorage.setItem('selected_account', accountId);
    window.location.reload();
  };

  const toggleExpand = (accountId: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  const selectedAccountId = localStorage.getItem('selected_account');
  const selectedAccount = metaAccounts.find(a => a.id === selectedAccountId);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Please login to manage accounts</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your Meta Business accounts</p>
      </div>

      {metaError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 flex-1">{metaError}</span>
          <button onClick={() => setMetaError(null)} className="text-red-500 hover:text-red-700">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mb-6">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add Meta Account
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New Meta Account</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Name *</label>
              <input
                type="text"
                value={newAccount.name}
                onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                placeholder="e.g., Realhubb Business"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">App ID *</label>
              <input
                type="text"
                value={newAccount.appId}
                onChange={(e) => setNewAccount({...newAccount, appId: e.target.value})}
                placeholder="1610947413287627"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">App Secret</label>
              <input
                type="password"
                value={newAccount.appSecret}
                onChange={(e) => setNewAccount({...newAccount, appSecret: e.target.value})}
                placeholder="Your App Secret"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Access Token *</label>
              <input
                type="password"
                value={newAccount.accessToken}
                onChange={(e) => setNewAccount({...newAccount, accessToken: e.target.value})}
                placeholder="EAAW5JexSI..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleAddAccount}
              disabled={addingAccount}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {addingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
              {addingAccount ? "Verifying..." : "Add Account"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewAccount({ name: "", appId: "", appSecret: "", accessToken: "" });
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Connected Meta Accounts ({metaAccounts.length})</h2>
          {selectedAccount && (
            <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Active: {selectedAccount.name}
            </p>
          )}
        </div>
        
        {metaAccounts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No Meta accounts connected</p>
            <p className="text-sm text-gray-400 mt-2">Add an account above to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {metaAccounts.map((account) => (
              <div key={account.id}>
                <div className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${selectedAccountId === account.id ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <div>
                      <p className="font-medium text-gray-900">{account.name}</p>
                      <p className="text-sm text-gray-500">
                        {account.adAccountName ? `${account.adAccountName} (${account.adAccountId})` : `App: ${account.appId}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSelectAccount(account.id)}
                      className={`px-3 py-1 text-sm rounded-lg ${
                        selectedAccountId === account.id 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      {selectedAccountId === account.id ? 'Active' : 'Use'}
                    </button>
                    <button
                      onClick={() => toggleExpand(account.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      {expandedAccounts.has(account.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleRemoveAccount(account.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {expandedAccounts.has(account.id) && (
                  <div className="px-4 pb-4 bg-gray-50">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Ad Account</p>
                        <p className="font-mono">{account.adAccountId || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Currency</p>
                        <p>{account.currency || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">App ID</p>
                        <p className="font-mono">{account.appId}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Access Token</p>
                        <p className="font-mono text-xs truncate">{account.accessToken.substring(0, 30) || 'N/A'}...</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
                <input type="text" defaultValue={user?.displayName || ''} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input type="email" defaultValue={user?.email || ''} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Bell className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <span className="text-gray-700">Email notifications</span>
                <input type="checkbox" className="w-5 h-5 text-blue-600" defaultChecked />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-gray-700">Campaign updates</span>
                <input type="checkbox" className="w-5 h-5 text-blue-600" defaultChecked />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsContent />
    </Suspense>
  );
}
