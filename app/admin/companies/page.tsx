'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Company = { id: string; name: string; contact_person: string | null; phone: string | null; email: string | null }
type Facility = { id: string; name: string; area: string }
type Cleaner = { id: string; name: string; user_id: string | null }

export default function CompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [companyFacilities, setCompanyFacilities] = useState<Record<string, string[]>>({})
  const [cleanersByCompany, setCleanersByCompany] = useState<Record<string, Cleaner[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)

  // 会社追加フォーム
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyContact, setNewCompanyContact] = useState('')
  const [newCompanyPhone, setNewCompanyPhone] = useState('')
  const [newCompanyEmail, setNewCompanyEmail] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)

  // 招待フォーム
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const [compRes, facRes, cfRes, cleanerRes] = await Promise.all([
      supabase.from('cleaning_companies').select('id, name, contact_person, phone, email').order('name'),
      supabase.from('facilities').select('id, name, area').order('area').order('name'),
      supabase.from('company_facilities').select('company_id, facility_id'),
      supabase.from('cleaners').select('id, name, user_id, company_id').eq('is_active', true),
    ])

    setCompanies((compRes.data || []) as Company[])
    setFacilities((facRes.data || []) as Facility[])

    const cfMap: Record<string, string[]> = {}
    for (const cf of cfRes.data || []) {
      if (!cfMap[cf.company_id]) cfMap[cf.company_id] = []
      cfMap[cf.company_id].push(cf.facility_id)
    }
    setCompanyFacilities(cfMap)

    const clMap: Record<string, Cleaner[]> = {}
    for (const c of (cleanerRes.data || []) as (Cleaner & { company_id: string })[]) {
      if (!clMap[c.company_id]) clMap[c.company_id] = []
      clMap[c.company_id].push(c)
    }
    setCleanersByCompany(clMap)
    setLoading(false)
  }

  const addCompany = async () => {
    if (!newCompanyName.trim()) return
    setSavingCompany(true)
    await supabase.from('cleaning_companies').insert({
      name: newCompanyName.trim(),
      contact_person: newCompanyContact.trim() || null,
      phone: newCompanyPhone.trim() || null,
      email: newCompanyEmail.trim() || null,
    })
    setNewCompanyName('')
    setNewCompanyContact('')
    setNewCompanyPhone('')
    setNewCompanyEmail('')
    setShowAddCompany(false)
    setSavingCompany(false)
    await load()
  }

  const toggleFacility = async (companyId: string, facilityId: string) => {
    const current = companyFacilities[companyId] || []
    const has = current.includes(facilityId)
    if (has) {
      await supabase.from('company_facilities')
        .delete()
        .eq('company_id', companyId)
        .eq('facility_id', facilityId)
      setCompanyFacilities(prev => ({
        ...prev,
        [companyId]: (prev[companyId] || []).filter(id => id !== facilityId),
      }))
    } else {
      await supabase.from('company_facilities').insert({ company_id: companyId, facility_id: facilityId })
      setCompanyFacilities(prev => ({
        ...prev,
        [companyId]: [...(prev[companyId] || []), facilityId],
      }))
    }
  }

  const deleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`「${companyName}」を削除しますか？\n関連する施設の紐付けも削除されます。`)) return
    await supabase.from('company_facilities').delete().eq('company_id', companyId)
    await supabase.from('cleaning_companies').delete().eq('id', companyId)
    await load()
    if (selectedCompany === companyId) setSelectedCompany(null)
  }

  const sendInvite = async (companyId: string) => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteMsg('')
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    })
    const json = await res.json()
    if (json.ok) {
      setInviteMsg(`✅ ${inviteEmail} に招待メールを送りました`)
      setInviteEmail('')
    } else {
      setInviteMsg(`❌ エラー: ${json.error}`)
    }
    setInviting(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>

  const grouped = facilities.reduce<Record<string, Facility[]>>((acc, f) => {
    const area = f.area || 'その他'
    if (!acc[area]) acc[area] = []
    acc[area].push(f)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/admin')} className="text-white text-2xl leading-none">‹</button>
        <h1 className="font-bold flex-1">清掃会社管理</h1>
        <button
          onClick={() => setShowAddCompany(true)}
          className="bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-lg"
        >
          ＋ 会社追加
        </button>
      </header>

      <div className="p-4 space-y-4">

        {/* 会社追加フォーム */}
        {showAddCompany && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-blue-200">
            <p className="font-bold text-gray-800 mb-3">新しい清掃会社を追加</p>
            <div className="space-y-3">
              <input
                type="text"
                value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                placeholder="会社名（必須）"
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={newCompanyContact}
                onChange={e => setNewCompanyContact(e.target.value)}
                placeholder="窓口担当者名"
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
              <input
                type="tel"
                value={newCompanyPhone}
                onChange={e => setNewCompanyPhone(e.target.value)}
                placeholder="電話番号"
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
              <input
                type="email"
                value={newCompanyEmail}
                onChange={e => setNewCompanyEmail(e.target.value)}
                placeholder="メールアドレス"
                className="w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddCompany(false); setNewCompanyName(''); setNewCompanyContact(''); setNewCompanyPhone(''); setNewCompanyEmail('') }}
                  className="flex-1 border rounded-xl py-2.5 text-sm text-gray-600"
                >キャンセル</button>
                <button
                  onClick={addCompany}
                  disabled={savingCompany || !newCompanyName.trim()}
                  className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                >追加する</button>
              </div>
            </div>
          </div>
        )}

        {/* 会社一覧 */}
        {companies.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🏢</p>
            <p className="text-sm">会社がまだ登録されていません</p>
          </div>
        ) : companies.map(company => {
          const isOpen = selectedCompany === company.id
          const assignedFacIds = companyFacilities[company.id] || []
          const cleaners = cleanersByCompany[company.id] || []

          return (
            <div key={company.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* 会社ヘッダー */}
              <div className="px-4 py-4 flex items-center gap-3">
                <button
                  onClick={() => setSelectedCompany(isOpen ? null : company.id)}
                  className="flex items-center gap-3 flex-1 text-left min-w-0"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">
                    🏢
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm">{company.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      担当施設 {assignedFacIds.length}件 · 清掃員 {cleaners.length}名
                    </p>
                  </div>
                  <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
                </button>
                <button
                  onClick={() => deleteCompany(company.id, company.name)}
                  className="text-red-400 text-xs border border-red-200 rounded-lg px-2 py-1 flex-shrink-0 hover:bg-red-50"
                >
                  削除
                </button>
              </div>

              {isOpen && (
                <div className="border-t px-4 py-4 space-y-5">

                  {/* 会社情報 */}
                  {(company.contact_person || company.phone || company.email) && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">会社情報</p>
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5 text-sm">
                        {company.contact_person && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs w-14 flex-shrink-0">担当者</span>
                            <span className="text-gray-700">{company.contact_person}</span>
                          </div>
                        )}
                        {company.phone && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs w-14 flex-shrink-0">電話</span>
                            <a href={`tel:${company.phone}`} className="text-blue-600">{company.phone}</a>
                          </div>
                        )}
                        {company.email && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs w-14 flex-shrink-0">メール</span>
                            <span className="text-gray-700 break-all">{company.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 担当施設 */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-3">担当施設</p>
                    {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'ja')).map(([area, facs]) => (
                      <div key={area} className="mb-3">
                        <p className="text-xs text-gray-400 font-medium mb-1.5">{area}</p>
                        <div className="space-y-1.5">
                          {facs.map(f => {
                            const checked = assignedFacIds.includes(f.id)
                            return (
                              <label key={f.id} className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleFacility(company.id, f.id)}
                                  className="w-4 h-4 accent-blue-600"
                                />
                                <span className={`text-sm ${checked ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                                  {f.name}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 清掃員一覧 */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-2">清掃員</p>
                    {cleaners.length === 0 ? (
                      <p className="text-xs text-gray-400">まだ登録されていません</p>
                    ) : (
                      <div className="space-y-1">
                        {cleaners.map(c => (
                          <div key={c.id} className="flex items-center gap-2 text-sm">
                            <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs">{c.name.slice(0, 1)}</span>
                            <span className="text-gray-700">{c.name}</span>
                            {c.user_id && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">登録済み</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 招待 */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-2">清掃員を招待</p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="メールアドレス"
                        className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => sendInvite(company.id)}
                        disabled={inviting || !inviteEmail.trim()}
                        className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                      >
                        {inviting ? '送信中...' : '招待'}
                      </button>
                    </div>
                    {inviteMsg && <p className="text-xs mt-2 text-gray-600">{inviteMsg}</p>}
                  </div>

                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
