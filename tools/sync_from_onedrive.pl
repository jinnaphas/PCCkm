#!/usr/bin/perl
# เพิ่มเอกสารใหม่จาก OneDrive ขึ้นเว็บ (เฉพาะรหัส BM-xxx-nnn ที่ยังไม่มีบนเว็บ)
# ใช้งาน:  perl tools/sync_from_onedrive.pl "<โฟลเดอร์ OneDrive Business Management>" [<repo>] [--apply]
#   ไม่ใส่ --apply = แสดงแผนเฉยๆ ไม่เขียนอะไร
# ต้องมีครบก่อน: ไฟล์ต้นฉบับ (Business Management From GG Drive/...) + ไฟล์ .md (knowledge_md/...) ที่ขึ้นต้นด้วยรหัสเดียวกัน
# ผลลัพธ์: คัดลอกไฟล์ไป assets/<หมวด>/<bm-xxx-nnn>/v1-<ชื่อไฟล์> และเพิ่มรายการท้าย data/library.json
use strict; use warnings; use utf8;
use JSON::PP; use File::Find; use File::Copy qw(copy); use File::Path qw(make_path); use POSIX qw(strftime); use FindBin;
binmode(STDOUT, ':utf8'); binmode(STDERR, ':utf8');

my $APPLY = grep { $_ eq '--apply' } @ARGV;
my @args = grep { $_ ne '--apply' } @ARGV;
my ($OD, $REPO) = @args;
die "usage: perl tools/sync_from_onedrive.pl <OneDrive Business Management folder> [<repo>] [--apply]\n" unless $OD && -d $OD;
$REPO //= "$FindBin::Bin/..";

my %WEB_CAT = (   # ต้องตรงกับ tools/check_sync.pl และตารางใน 00_INDEX.md
  STR => 'g1-knowledge-management', COE => 'g2-km-coe', AI => 'g3-km-digital-ai', OPS => 'g3-km-ops-excellence',
  IC => 'g4-km-intellectual-capital', HC => 'g4-km-ic-human', INF => 'g4-km-ic-information', DPC => 'g4-km-ic-digital-process',
  REL => 'g4-km-ic-relationship', CUS => 'g4-km-ic-customer', REV => 'g4-km-revenue-streams', BG => 'g4-km-business-generation',
  DS => 'g4-km-demand-satisfaction', ESG => 'g4-km-esg', FIN => 'g4-km-finance-budget', POL => 'g4-km-policy-risk-compliance',
  PRJ => 'g4-km-projects-kpi', MTG => 'g4-km-meetings-decisions', REF => 'g4-km-external-references',
);
my $js = JSON::PP->new->allow_nonref; sub j { $js->encode($_[0]) }
sub slurp { open my $h, '<:encoding(UTF-8)', $_[0] or die "$_[0]: $!"; local $/; my $t = <$h>; $t }
sub sanitize { my $n = shift; $n =~ s/[^A-Za-z0-9ก-๙._-]+/_/g; $n }

my $file = "$REPO/data/library.json"; my $text = slurp($file); my $crlf = ($text =~ /\r\n/) ? 1 : 0; $text =~ s/\r\n/\n/g;
my $lib = $js->decode($text);
my %have; for my $d (@{ $lib->{documents} }) { $have{$_} = $d->{id} for grep { /^BM-[A-Z]+-\d{3}$/ } @{ $d->{tags} || [] } }
my %catok = map { $_->{id} => 1 } @{ $lib->{categories} };

my (%md, %orig);
find({ no_chdir => 1, wanted => sub { my $f = $File::Find::name; return unless -f $f; (my $rel = $f) =~ s{^\Q$OD\E/}{};
  if ($rel =~ m{^knowledge_md/.*?(BM-[A-Z]+-\d{3})_[^/]*\.md$}) { $md{$1} = $f }
  elsif ($rel =~ m{^Business Management From GG Drive/} && $rel !~ m{/LINE/} && $rel =~ m{/(BM-[A-Z]+-\d{3})_[^/]+$}) { push @{ $orig{$1} }, $f } } }, $OD);

my $now = strftime('%Y-%m-%dT%H:%M:%S.000Z', gmtime); my $by = 'นำเข้าจาก OneDrive (tools/sync_from_onedrive.pl)'; my $note = 'นำเข้าจาก OneDrive: Business Management';
my (@new, @skip);
for my $code (sort keys %md) {
  next if $have{$code};
  my ($pfx) = $code =~ /^BM-([A-Z]+)-/;
  my $cat = $WEB_CAT{$pfx};
  unless ($cat && $catok{$cat}) { push @skip, "$code: ไม่รู้จักรหัสหมวด '$pfx' หรือหมวดบนเว็บไม่มี — เพิ่มใน %WEB_CAT และสร้างหมวดบนเว็บก่อน"; next }
  unless ($orig{$code}) { push @skip, "$code: มี .md แต่ไม่มีไฟล์ต้นฉบับใน Business Management From GG Drive/ — วางต้นฉบับก่อน"; next }
  my $t = slurp($md{$code}); $t =~ s/\r//g; $t =~ /\A---\n(.*?)\n---\n/s or do { push @skip, "$code: .md ไม่มี front matter"; next }; my $fm = $1;
  my ($title) = $fm =~ /^title:\s*(".*")\s*$/m; my ($title_en) = $fm =~ /^title_en:\s*(".*")\s*$/m; my ($tags) = $fm =~ /^tags:\s*(\[.*\])\s*$/m;
  unless ($title) { push @skip, "$code: .md ไม่มี title"; next }
  $title = $js->decode($title); $title_en = $title_en ? $js->decode($title_en) : $title; my @tags = $tags ? @{ $js->decode($tags) } : ();
  my $id = lc $code; my %seen;
  my @files = map { my $n = ($_ =~ m{([^/]+)$})[0]; { src => $_, name => $n, type => lc(($n =~ /\.([^.]+)$/)[0] // ''), role => undef } }
              sort { (($a =~ /\.pdf$/i) ? 0 : 1) <=> (($b =~ /\.pdf$/i) ? 0 : 1) or $a cmp $b } @{ $orig{$code} };
  my ($mdn) = $md{$code} =~ m{([^/]+)$};
  push @files, { src => $md{$code}, name => $mdn, type => 'md', role => 'llm-md' };
  for my $f (@files) { $f->{size} = -s $f->{src}; $f->{path} = "assets/$cat/$id/v1-" . sanitize($f->{name}) }
  push @new, { code => $code, id => $id, cat => $cat, title => $title, desc => $title_en, tags => [ grep { !$seen{$_}++ } ($code, @tags, 'Markdown', 'LLM') ], files => \@files };
}

if (!@new && !@skip) { print "ไม่มีเอกสารใหม่ — ทุกรหัสใน knowledge_md/ มีบนเว็บแล้ว\n"; exit 0 }
printf "เอกสารที่จะเพิ่มบนเว็บ: %d\n", scalar @new;
for my $n (@new) { printf "  + %s → %s  (%d ไฟล์: %s)\n", $n->{code}, $n->{cat}, scalar @{ $n->{files} }, join(', ', map { $_->{name} } @{ $n->{files} }) }
print "ข้าม:\n" . join("\n", map { "  ! $_" } @skip) . "\n" if @skip;
unless ($APPLY) { print "\n(แผนเฉยๆ — ใส่ --apply เพื่อเขียนจริง)\n"; exit(@skip ? 1 : 0) }
exit(@skip ? 1 : 0) unless @new;

sub att  { my $a = shift; "        {\n          \"kind\": \"file\",\n          \"path\": " . j($a->{path}) . ",\n          \"name\": " . j($a->{name}) . ",\n          \"type\": " . j($a->{type}) . ",\n          \"size\": $a->{size}" . ($a->{role} ? ",\n          \"role\": " . j($a->{role}) : '') . "\n        }" }
sub snap { my $a = shift; "            {\n              \"kind\": \"file\",\n              \"path\": " . j($a->{path}) . ",\n              \"name\": " . j($a->{name}) . ($a->{role} ? ",\n              \"role\": " . j($a->{role}) : '') . "\n            }" }
my @entries;
for my $n (@new) {
  push @entries, "    {\n      \"id\": " . j($n->{id}) . ",\n      \"title\": " . j($n->{title}) . ",\n      \"description\": " . j($n->{desc}) . ",\n      \"categoryId\": " . j($n->{cat}) .
    ",\n      \"tags\": [\n" . join(",\n", map { "        " . j($_) } @{ $n->{tags} }) . "\n      ],\n      \"attachments\": [\n" . join(",\n", map { att($_) } @{ $n->{files} }) .
    "\n      ],\n      \"version\": 1,\n      \"createdAt\": " . j($now) . ",\n      \"createdBy\": " . j($by) . ",\n      \"updatedAt\": " . j($now) . ",\n      \"updatedBy\": " . j($by) .
    ",\n      \"history\": [\n        {\n          \"version\": 1,\n          \"attachments\": [\n" . join(",\n", map { snap($_) } @{ $n->{files} }) .
    "\n          ],\n          \"updatedAt\": " . j($now) . ",\n          \"updatedBy\": " . j($by) . ",\n          \"note\": " . j($note) . "\n        }\n      ]\n    }";
}
(my $new = $text) =~ s/\n  \]\n\}\s*\z// or die "unexpected end of library.json";
$new .= ",\n" . join(",\n", @entries) . "\n  ]\n}\n";
$js->decode($new);   # ต้อง parse ได้ก่อนเขียน
for my $n (@new) {
  for my $f (@{ $n->{files} }) {
    my $to  = "$REPO/$f->{path}";
    my $dir = $to; $dir =~ s{/[^/]+\z}{};
    make_path($dir);
    copy($f->{src}, $to) or die "คัดลอกไม่สำเร็จ $f->{src} → $to: $!";
    die "คัดลอกแล้วแต่ไม่พบไฟล์ปลายทาง: $to" unless -f $to && (-s $to) == $f->{size};
  }
}
$new =~ s/\n/\r\n/g if $crlf;
open my $o, '>:encoding(UTF-8)', $file or die $!; print $o $new; close $o;
printf "เขียนแล้ว: เพิ่ม %d เอกสาร — รัน tools/check_sync.pl เพื่อตรวจซ้ำ\n", scalar @new;
