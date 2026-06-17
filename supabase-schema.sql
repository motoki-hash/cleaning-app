-- 民泊施設清掃管理システム テーブル定義

-- 施設テーブル
CREATE TABLE facilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  contact_phone VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 客室テーブル
CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  room_number VARCHAR(50) NOT NULL,
  room_type VARCHAR(50),
  floor INTEGER,
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'cleaning', 'maintenance')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(facility_id, room_number)
);

-- 清掃会社テーブル
CREATE TABLE cleaning_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 清掃員テーブル
CREATE TABLE cleaners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES cleaning_companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 清掃記録テーブル
CREATE TABLE cleaning_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE RESTRICT,
  scheduled_date DATE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 清掃写真テーブル
CREATE TABLE cleaning_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cleaning_record_id UUID NOT NULL REFERENCES cleaning_records(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_type VARCHAR(20) CHECK (photo_type IN ('before', 'after', 'issue')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- トラブル報告テーブル
CREATE TABLE trouble_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cleaning_record_id UUID REFERENCES cleaning_records(id) ON DELETE SET NULL,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_rooms_facility_id ON rooms(facility_id);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_cleaners_company_id ON cleaners(company_id);
CREATE INDEX idx_cleaners_user_id ON cleaners(user_id);
CREATE INDEX idx_cleaning_records_room_id ON cleaning_records(room_id);
CREATE INDEX idx_cleaning_records_cleaner_id ON cleaning_records(cleaner_id);
CREATE INDEX idx_cleaning_records_scheduled_date ON cleaning_records(scheduled_date);
CREATE INDEX idx_cleaning_records_status ON cleaning_records(status);
CREATE INDEX idx_cleaning_photos_cleaning_record_id ON cleaning_photos(cleaning_record_id);
CREATE INDEX idx_trouble_reports_room_id ON trouble_reports(room_id);
CREATE INDEX idx_trouble_reports_status ON trouble_reports(status);
CREATE INDEX idx_trouble_reports_priority ON trouble_reports(priority);

-- Row Level Security (RLS) を有効化
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE trouble_reports ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（基本的な読み取り権限 - 認証ユーザー全員）
CREATE POLICY "Allow authenticated read access on facilities" ON facilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access on rooms" ON rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access on cleaning_companies" ON cleaning_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access on cleaners" ON cleaners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access on cleaning_records" ON cleaning_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access on cleaning_photos" ON cleaning_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access on trouble_reports" ON trouble_reports FOR SELECT TO authenticated USING (true);

-- 清掃記録の作成・更新権限（清掃員本人のみ）
CREATE POLICY "Allow cleaners to insert their own records" ON cleaning_records FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cleaners WHERE cleaners.id = cleaning_records.cleaner_id AND cleaners.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow cleaners to update their own records" ON cleaning_records FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cleaners WHERE cleaners.id = cleaning_records.cleaner_id AND cleaners.user_id = auth.uid()
    )
  );

-- 清掃写真のアップロード権限
CREATE POLICY "Allow cleaners to insert photos for their records" ON cleaning_photos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cleaning_records cr
      JOIN cleaners c ON c.id = cr.cleaner_id
      WHERE cr.id = cleaning_photos.cleaning_record_id AND c.user_id = auth.uid()
    )
  );

-- トラブル報告の作成権限（認証ユーザー全員）
CREATE POLICY "Allow authenticated users to create trouble reports" ON trouble_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Allow users to update their own trouble reports" ON trouble_reports FOR UPDATE TO authenticated
  USING (reporter_id = auth.uid());

-- updated_at自動更新トリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 各テーブルにトリガーを適用
CREATE TRIGGER update_facilities_updated_at BEFORE UPDATE ON facilities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cleaning_companies_updated_at BEFORE UPDATE ON cleaning_companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cleaners_updated_at BEFORE UPDATE ON cleaners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cleaning_records_updated_at BEFORE UPDATE ON cleaning_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cleaning_photos_updated_at BEFORE UPDATE ON cleaning_photos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trouble_reports_updated_at BEFORE UPDATE ON trouble_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ストレージバケット作成（画像アップロード用）
-- これはSupabase UIまたはSupabase CLIで実行する必要があります
-- INSERT INTO storage.buckets (id, name, public) VALUES ('cleaning-photos', 'cleaning-photos', true);
