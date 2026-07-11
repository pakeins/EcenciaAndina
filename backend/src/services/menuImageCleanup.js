const MENU_ASSETS_BUCKET = 'ecencia-menu-assets';
const MENU_IMAGES_FOLDER = 'telegram';
const DEFAULT_IMAGE_RETENTION_DAYS = 14;
const MAX_IMAGE_RETENTION_DAYS = 365;
const STORAGE_PAGE_SIZE = 100;
const DATABASE_PAGE_SIZE = 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MANAGED_IMAGE_PATTERN = /^menu-dashboard-(\d+)\.(?:jpe?g|png|webp)$/i;

const normalizeRetentionDays = (value) => {
  const retentionDays = Number(value);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > MAX_IMAGE_RETENTION_DAYS) {
    return DEFAULT_IMAGE_RETENTION_DAYS;
  }
  return retentionDays;
};

const storagePathFromPublicUrl = (url) => {
  const marker = `/storage/v1/object/public/${MENU_ASSETS_BUCKET}/`;
  const index = String(url || '').indexOf(marker);
  if (index < 0) return '';

  try {
    return decodeURIComponent(String(url).slice(index + marker.length).split('?')[0]);
  } catch {
    return '';
  }
};

const managedFileDate = (file) => {
  const createdAt = new Date(file.created_at || '');
  if (!Number.isNaN(createdAt.getTime())) return createdAt;

  const match = String(file.name || '').match(MANAGED_IMAGE_PATTERN);
  if (!match) return null;

  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return null;
  const timestampDate = new Date(timestamp);
  return Number.isNaN(timestampDate.getTime()) ? null : timestampDate;
};

const buildCleanupPlan = ({
  files,
  menuRows,
  activeDate,
  retentionDays,
  now = new Date(),
}) => {
  const safeRetentionDays = normalizeRetentionDays(retentionDays);
  const cutoff = new Date(now.getTime() - safeRetentionDays * MILLISECONDS_PER_DAY);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const protectedPaths = new Set();

  for (const row of menuRows || []) {
    if (!row?.imagen_url) continue;
    if (row.fecha === activeDate || row.fecha >= cutoffDate) {
      const path = storagePathFromPublicUrl(row.imagen_url);
      if (path) protectedPaths.add(path);
    }
  }

  const pathsToDelete = [];
  for (const file of files || []) {
    if (file?.id === null) continue;
    if (!MANAGED_IMAGE_PATTERN.test(String(file?.name || ''))) continue;

    const path = `${MENU_IMAGES_FOLDER}/${file.name}`;
    const createdAt = managedFileDate(file);
    if (createdAt && createdAt < cutoff && !protectedPaths.has(path)) {
      pathsToDelete.push(path);
    }
  }

  const deletedPaths = new Set(pathsToDelete);
  const urlsToClear = [
    ...new Set(
      (menuRows || [])
        .filter((row) => deletedPaths.has(storagePathFromPublicUrl(row?.imagen_url)))
        .map((row) => row.imagen_url),
    ),
  ];

  return {
    retentionDays: safeRetentionDays,
    cutoffDate,
    scanned: (files || []).length,
    protected: protectedPaths.size,
    pathsToDelete,
    urlsToClear,
  };
};

const listStorageFiles = async (storageBucket) => {
  const files = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storageBucket.list(MENU_IMAGES_FOLDER, {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: 'created_at', order: 'asc' },
    });

    if (error) throw error;
    const page = data || [];
    files.push(...page);
    if (page.length < STORAGE_PAGE_SIZE) break;
    offset += page.length;
  }

  return files;
};

const listMenuRows = async (adminClient) => {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await adminClient
      .from('menu_diario')
      .select('fecha,imagen_url')
      .not('imagen_url', 'is', null)
      .range(offset, offset + DATABASE_PAGE_SIZE - 1);

    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < DATABASE_PAGE_SIZE) break;
    offset += page.length;
  }

  return rows;
};

const getCleanupSettings = async (adminClient) => {
  const { data, error } = await adminClient
    .from('menu_settings')
    .select('active_date,image_retention_days')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  return data || {};
};

const cleanupOldMenuImages = async (adminClient, options = {}) => {
  const settings = await getCleanupSettings(adminClient);
  const menuRows = await listMenuRows(adminClient);
  const storageBucket = adminClient.storage.from(MENU_ASSETS_BUCKET);
  const files = await listStorageFiles(storageBucket);
  const configuredRetention =
    settings.image_retention_days ||
    process.env.MENU_IMAGE_RETENTION_DAYS ||
    DEFAULT_IMAGE_RETENTION_DAYS;
  const plan = buildCleanupPlan({
    files,
    menuRows,
    activeDate: settings.active_date,
    retentionDays: configuredRetention,
    now: options.now || new Date(),
  });

  if (!plan.pathsToDelete.length) {
    return {
      retentionDays: plan.retentionDays,
      cutoffDate: plan.cutoffDate,
      scanned: plan.scanned,
      protected: plan.protected,
      deleted: 0,
      referencesCleared: 0,
    };
  }

  const { error: removeError } = await storageBucket.remove(plan.pathsToDelete);
  if (removeError) throw removeError;

  if (plan.urlsToClear.length) {
    const { error: updateError } = await adminClient
      .from('menu_diario')
      .update({ imagen_url: null })
      .in('imagen_url', plan.urlsToClear);

    if (updateError) throw updateError;
  }

  return {
    retentionDays: plan.retentionDays,
    cutoffDate: plan.cutoffDate,
    scanned: plan.scanned,
    protected: plan.protected,
    deleted: plan.pathsToDelete.length,
    referencesCleared: plan.urlsToClear.length,
  };
};

module.exports = {
  cleanupOldMenuImages,
  _private: {
    buildCleanupPlan,
    managedFileDate,
    normalizeRetentionDays,
    storagePathFromPublicUrl,
  },
};
