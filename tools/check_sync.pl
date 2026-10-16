#!/usr/bin/perl
# ตรวจว่าข้อมูลใน OneDrive (Business Management) กับเว็บ (data/library.json + assets/) ตรงกันทุกเอกสาร
# ใช้งาน:  perl tools/check_sync.pl "<โฟลเดอร์ OneDrive Business Management>" [<โฟลเดอร์ repo PCCkm>]
# คืนค่า exit 0 = ตรงกันทั้งหมด, 1 = พบความต่าง
#
# กุญแจจับคู่คือรหัสเอกสาร BM-xxx-nnn:
#   OneDrive : ชื่อไฟล์ต้นฉบับ/ไฟล์ .md ขึ้นต้นด้วยรหัส + แถวใน 00_INDEX.csv
#   เว็บ     : tag รหัสเอกสาร + หมวดอยู่ใต้ Knowledge Management + มีไฟล์ .md (role = llm-md)
use strict; use warnings; use utf8;
use JSON::PP; use Digest::MD5; use File::Find; use FindBin;
binmode(STDOUT, ':utf8'); binmode(STDERR, ':utf8');

my ($OD, $REPO) = @ARGV;
die "usage: perl tools/check_sync.pl <OneDrive Business Management folder> [<repo>]\n" unless $OD && -d $OD;
$REPO //= "$FindBin::Bin/..";
my $js = JSON::PP->new->allow_nonref;
sub slurp { open my $h, '<:encoding(UTF-8)', $_[0] or die "$_[0]: $!"; local $/; my $t = <$h>; $t =~ s/\A\x{FEFF}//; $t }
sub md5 { open my $h, '<:raw', $_[0] or return undef; my $d = Digest::MD5->new; $d->addfile($h); $d->hexdigest }

# รหัสหมวดในสารบัญ -> หมวดบนเว็บ (ต้องตรงกับตาราง "การจัดหมวดบนเว็บ" ใน 00_INDEX.md)
my %WEB_CAT = (
  STR => 'g1-knowledge-management', COE => 'g2-km-coe',
  AI  => 'g3-km-digital-ai', OPS => 'g3-km-ops-excellence',
  IC  => 'g4-km-intellectual-capital', HC => 'g4-km-ic-human', INF => 'g4-km-ic-information',
  DPC => 'g4-km-ic-digital-process', REL => 'g4-km-ic-relationship', CUS => 'g4-km-ic-customer',
  REV => 'g4-km-revenue-streams', BG => 'g4-km-business-generation', DS => 'g4-km-demand-satisfaction',
  ESG => 'g4-km-esg', FIN => 'g4-km-finance-budget', POL => 'g4-km-policy-risk-compliance',
  PRJ => 'g4-km-projects-kpi', MTG => 'g4-km-meetings-decisions', REF => 'g4-km-external-references',
);

# ---------- เว็บ ----------
my $lib = $js->decode(slurp("$REPO/data/library.json"));
my %cat = map { $_->{id} => $_ } @{ $lib->{categories} };
sub in_km { my $id = shift; my $n = 0; while ($id && $cat{$id} && $n++ < 10) { return 1 if $cat{$id}{name} =~ /^Knowledge Management$/i; $id = $cat{$id}{parentId} } 0 }
my (%web, @issues, @notes);
for my $d (@{ $lib->{documents} }) {
  next unless in_km($d->{categoryId});
  my ($code) = grep { /^BM-[A-Z]+-\d{3}$/ } @{ $d->{tags} || [] };
  if (!$code) { push @issues, "เว็บ: เอกสาร '$d->{id}' อยู่ใน Knowledge Management แต่ไม่มี tag รหัสเอกสาร BM-xxx-nnn"; next }
  push @issues, "เว็บ: รหัส $code ซ้ำในเอกสาร '$web{$code}{id}' และ '$d->{id}'" if $web{$code};
  $web{$code} = $d;
}

# ---------- OneDrive ----------
my (%md, %orig, %csv);
find({ no_chdir => 1, wanted => sub {
  my $f = $File::Find::name; return unless -f $f;
  (my $rel = $f) =~ s{^\Q$OD\E/}{};
  if ($rel =~ m{^knowledge_md/.*?/?(BM-[A-Z]+-\d{3})_[^/]*\.md$}) { $md{$1} = $f }
  elsif ($rel =~ m{^Business Management From GG Drive/} && $rel !~ m{/LINE/} && $rel =~ m{/(BM-[A-Z]+-\d{3})_[^/]+$}) { push @{ $orig{$1} }, $f }
} }, $OD);

if (open my $ch, '<:encoding(UTF-8)', "$OD/00_INDEX.csv") {
  local $/; my $t = <$ch>; close $ch; $t =~ s/\A\x{FEFF}//; $t =~ s/\r\n/\n/g;
  my @recs; my ($cur, $inq) = ('', 0);
  for my $line (split /(?<=\n)/, $t) { $cur .= $line; my $n = () = $line =~ /"/g; $inq = !$inq if $n % 2; unless ($inq) { push @recs, $cur; $cur = '' } }
  shift @recs;
  for my $r (@recs) {
    my @f; my $rest = $r; $rest =~ s/\n\z//;
    while (@f < 5 && $rest =~ s/\A(?:"((?:[^"]|"")*)"|([^,]*))(?:,|\z)//) { my $v = defined $1 ? $1 : $2; $v =~ s/""/"/g; push @f, $v }
    $csv{$f[1]} = { title => $f[4], cat => $f[3] } if $f[1] =~ /^BM-[A-Z]+-\d{3}$/;
  }
} else { push @issues, "OneDrive: เปิด 00_INDEX.csv ไม่ได้" }

sub md_front { my $f = shift; my $t = slurp($f); $t =~ s/\r//g; my %h; if ($t =~ /\A---\n(.*?)\n---\n/s) { my $fm = $1;
  ($h{title}) = $fm =~ /^title:\s*"((?:[^"\\]|\\.)*)"\s*$/m; $h{title} =~ s/\\"/"/g if defined $h{title};
  my ($doc) = $fm =~ /^doc_id:\s*(\S+)/m; $h{doc_id} = $doc } \%h }

# ---------- เทียบกัน ----------
my %codes = map { $_ => 1 } (keys %web, keys %md, keys %csv, keys %orig);
my $ok = 0;
for my $code (sort keys %codes) {
  my @p;      # ปัญหาของเอกสารนี้
  my ($pfx) = $code =~ /^BM-([A-Z]+)-/;
  my $w = $web{$code};
  push @p, 'ไม่มีแถวใน 00_INDEX.csv' unless $csv{$code};
  push @p, 'ไม่มีไฟล์ .md ใน knowledge_md/' unless $md{$code};
  push @p, 'ไม่มีไฟล์ต้นฉบับใน Business Management From GG Drive/' unless $orig{$code};
  push @p, 'ไม่มีบนเว็บ (library.json)' unless $w;
  if ($w) {
    push @p, "หมวดบนเว็บเป็น '$w->{categoryId}' แต่รหัส $pfx ควรอยู่ '$WEB_CAT{$pfx}'" if $WEB_CAT{$pfx} && $w->{categoryId} ne $WEB_CAT{$pfx};
    push @p, "ไม่รู้จักรหัสหมวด $pfx (เพิ่มใน %WEB_CAT ของสคริปต์นี้และในตารางของ 00_INDEX.md)" unless $WEB_CAT{$pfx};
    my @atts = grep { $_->{kind} eq 'file' } @{ $w->{attachments} || [] };
    my ($wmd) = grep { ($_->{role} // '') eq 'llm-md' } @atts;
    push @p, 'เว็บ: ไม่มีไฟล์ .md (role = llm-md)' unless $wmd;
    for my $a (@atts) { push @p, "เว็บ: ไฟล์หายจาก assets/ → $a->{path}" unless -f "$REPO/$a->{path}" }
    if ($wmd && $md{$code} && -f "$REPO/$wmd->{path}") { push @p, 'เนื้อหา .md บนเว็บไม่ตรงกับ knowledge_md/ ใน OneDrive' if md5("$REPO/$wmd->{path}") ne md5($md{$code}) }
    # ไฟล์ต้นฉบับ: ทุกไฟล์ใน OneDrive ต้องมีบนเว็บ (ชื่อเดียวกัน เนื้อหาเหมือนกัน)
    my %wbyname = map { $_->{name} => $_ } grep { ($_->{role} // '') ne 'llm-md' } @atts;
    for my $f (@{ $orig{$code} || [] }) { my ($n) = $f =~ m{([^/]+)$};
      my $a = $wbyname{$n}; if (!$a) { push @p, "ไฟล์ต้นฉบับไม่อยู่บนเว็บ: $n"; next }
      push @p, "ไฟล์ต้นฉบับต่างกัน (OneDrive ≠ เว็บ): $n" if -f "$REPO/$a->{path}" && md5($f) ne md5("$REPO/$a->{path}") }
    my %onames = map { (($_ =~ m{([^/]+)$})[0]) => 1 } @{ $orig{$code} || [] };
    for my $n (sort keys %wbyname) { push @p, "ไฟล์บนเว็บไม่มีใน OneDrive: $n" unless $onames{$n} }
    # ชื่อเอกสาร
    my $fm = $md{$code} ? md_front($md{$code}) : {};
    push @p, 'ชื่อเอกสารบนเว็บ ≠ title ใน .md' if defined $fm->{title} && $fm->{title} ne $w->{title};
    push @p, 'ชื่อเอกสารบนเว็บ ≠ ชื่อใน 00_INDEX.csv' if $csv{$code} && $csv{$code}{title} ne $w->{title};
    push @p, "doc_id ใน .md ($fm->{doc_id}) ไม่ตรงรหัส $code" if defined $fm->{doc_id} && $fm->{doc_id} ne $code;
  }
  if (@p) { push @issues, "$code:\n    - " . join("\n    - ", @p) } else { $ok++ }
}
printf "ตรวจ %d เอกสาร: ตรงกัน %d, พบความต่าง %d\n", scalar(keys %codes), $ok, scalar(keys %codes) - $ok;
if (@issues) { print "\nรายการที่ต้องแก้:\n" . join("\n", map { "  * $_" } @issues) . "\n"; exit 1 }
print "OneDrive และเว็บตรงกันทั้งหมด\n"; exit 0;
