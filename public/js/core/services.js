/**
 * YTP Archive - SQL Services
 * Centralized SQL queries to keep page logic clean.
 */

(function() {
  
  // --- VIDEO SERVICES ---
  
  window.getVideoById = (vidId, db) => {
    return queryDBRow("SELECT * FROM videos WHERE id = ?", [vidId], db);
  };

  window.getVideoTags = (vidId, db) => {
    return queryDB("SELECT t.name FROM tags t JOIN video_tags vt ON t.id = vt.tag_id WHERE vt.video_id = ?", [vidId], db).map(r => r.name);
  };

  window.getVideoSections = (vidId, db) => {
    return queryDB("SELECT s.name FROM sections s JOIN video_sections vs ON s.id = vs.section_id WHERE vs.video_id = ?", [vidId], db).map(r => r.name);
  };

  window.getVideoComments = (vidId, db) => {
    return queryDB("SELECT * FROM comments WHERE video_id = ? ORDER BY published_at ASC", [vidId], db);
  };

  window.getMoreVideosByChannel = (channelName, excludeId, maxYear, limit = 5) => {
    return queryDB("SELECT * FROM videos WHERE channel_name = ? AND id != ? AND (title IS NOT NULL AND title != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL) LIMIT ?", [channelName, excludeId, maxYear, limit]);
  };

  window.getVideosByIds = (ids) => {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    return queryDB(`SELECT * FROM videos WHERE id IN (${placeholders}) AND (title IS NOT NULL AND title != '')`, ids);
  };

  window.getLatestVideos = (maxYear, limit = 12, db) => {
    return queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') AND (publish_date IS NOT NULL AND publish_date != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ?) ORDER BY publish_date DESC LIMIT ?", [maxYear, limit], db);
  };

  window.getRandomVideos = (maxYear, limit = 12, db) => {
    return queryDB("SELECT * FROM videos WHERE (title IS NOT NULL AND title != '') AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL) ORDER BY RANDOM() LIMIT ?", [maxYear, limit], db);
  };

  // --- CHANNEL SERVICES ---

  window.getChannelByName = (name) => {
    return queryDBRow("SELECT * FROM channels WHERE channel_name = ?", [name]);
  };

  window.getVideosByChannel = (name, maxYear) => {
    return queryDB("SELECT * FROM videos WHERE channel_name = ? AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL)", [name, maxYear]);
  };

  window.getChannelStats = (name, db) => {
    return queryDBRow("SELECT COUNT(*) as count, SUM(view_count) as views FROM videos WHERE channel_name = ?", [name], db);
  };

  window.getChannelVideosByYear = (name) => {
    return queryDB("SELECT substr(publish_date, 1, 4) as y, COUNT(*) as c FROM videos WHERE channel_name = ? GROUP BY y", [name]);
  };

  window.getChannelStatusCount = (name) => {
    return queryDB("SELECT status, COUNT(*) as c FROM videos WHERE channel_name = ? GROUP BY status", [name]);
  };

  window.getChannelVideosChronological = (name) => {
    return queryDB("SELECT * FROM videos WHERE channel_name = ? ORDER BY publish_date ASC", [name]);
  };

  window.getAllChannels = () => {
    return queryDB("SELECT * FROM channels");
  };

  window.searchChannels = (query) => {
    return queryDB("SELECT channel_name as text FROM channels WHERE channel_name LIKE ? LIMIT 5", [`%${query}%`]);
  };

  window.getChannelSummaries = (maxYear) => {
    return queryDB(`
      SELECT 
        channel_name as name, 
        channel_url as url, 
        COUNT(*) as videoCount, 
        SUM(view_count) as totalViews, 
        SUM(like_count) as totalLikes,
        MIN(substr(publish_date, 1, 4)) as firstYear
      FROM videos 
      WHERE channel_name IS NOT NULL AND (CAST(substr(publish_date, 1, 4) AS INTEGER) <= ? OR publish_date IS NULL)
      GROUP BY channel_name 
      ORDER BY videoCount DESC
    `, [maxYear]);
  };

  window.getChannelCount = () => {
    return queryDBRow("SELECT COUNT(*) as c FROM channels", [], window.dbPoopers).c || 0;
  };

  window.getAllCreators = (db) => {
    return queryDB("SELECT channel_name, COUNT(*) as c FROM videos GROUP BY channel_name", [], db);
  };

  // --- YEAR & STATS SERVICES ---

  window.getGlobalYears = (db) => {
    return queryDB("SELECT DISTINCT substr(publish_date, 1, 4) as y FROM videos WHERE publish_date IS NOT NULL", [], db);
  };

  window.getVideosCountByYear = (db) => {
    return queryDB("SELECT substr(publish_date, 1, 4) as y, COUNT(*) as c FROM videos WHERE publish_date IS NOT NULL GROUP BY y", [], db);
  };

  window.getCreatorsByYear = (year, db) => {
    return queryDB("SELECT channel_name, COUNT(*) as c FROM videos WHERE substr(publish_date, 1, 4) = ? GROUP BY channel_name", [year], db);
  };

  window.getTagsByYear = (year, db) => {
    return queryDB(`
      SELECT t.name, COUNT(*) as c 
      FROM tags t 
      JOIN video_tags vt ON t.id = vt.tag_id 
      JOIN videos v ON vt.video_id = v.id 
      WHERE substr(v.publish_date, 1, 4) = ? 
      GROUP BY t.name
    `, [year], db);
  };

  window.getVideosByMonthInYear = (year, db) => {
    return queryDB("SELECT substr(publish_date, 6, 2) as m, COUNT(*) as c FROM videos WHERE substr(publish_date, 1, 4) = ? GROUP BY m", [year], db);
  };

  window.getTopVideosByViewsInYear = (year, limit = 20, db) => {
    return queryDB("SELECT * FROM videos WHERE substr(publish_date, 1, 4) = ? AND view_count IS NOT NULL ORDER BY view_count DESC LIMIT ?", [year, limit], db);
  };

  window.getTopVideosByLikesInYear = (year, limit = 20, db) => {
    return queryDB("SELECT * FROM videos WHERE substr(publish_date, 1, 4) = ? AND like_count IS NOT NULL ORDER BY like_count DESC LIMIT ?", [year, limit], db);
  };

  window.getMinYear = () => {
    return queryDBRow("SELECT MIN(CAST(substr(publish_date, 1, 4) AS INTEGER)) as m FROM videos");
  };

  window.getGlobalStats = (db) => {
    return queryDBRow(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN title IS NOT NULL THEN 1 ELSE 0 END) as withTitle,
        SUM(CASE WHEN view_count IS NOT NULL AND view_count > 0 THEN 1 ELSE 0 END) as withViewsCount,
        SUM(view_count) as totalViews,
        SUM(like_count) as totalLikes,
        SUM(CASE WHEN local_file IS NULL THEN 1 ELSE 0 END) as available
      FROM videos
    `, [], db);
  };

  window.getViewsDistribution = (db) => {
    return queryDBRow(`
      SELECT 
        SUM(CASE WHEN view_count > 0 AND view_count < 100 THEN 1 ELSE 0 END) as v100,
        SUM(CASE WHEN view_count >= 100 AND view_count < 1000 THEN 1 ELSE 0 END) as v1k,
        SUM(CASE WHEN view_count >= 1000 AND view_count < 10000 THEN 1 ELSE 0 END) as v10k,
        SUM(CASE WHEN view_count >= 10000 AND view_count < 100000 THEN 1 ELSE 0 END) as v100k,
        SUM(CASE WHEN view_count >= 100000 AND view_count < 1000000 THEN 1 ELSE 0 END) as v1m,
        SUM(CASE WHEN view_count >= 1000000 THEN 1 ELSE 0 END) as v1mp
      FROM videos
    `, [], db);
  };

  window.getTopVideosByViews = (limit = 20, db) => {
    return queryDB("SELECT * FROM videos WHERE view_count IS NOT NULL ORDER BY view_count DESC LIMIT ?", [limit], db);
  };

  // --- UI & RENDERER SERVICES ---

  window.getSectionsList = (isSource, dbYTP, dbSources) => {
    return queryDB(`
      SELECT DISTINCT s.name 
      FROM sections s 
      JOIN video_sections vs ON s.id = vs.section_id 
      JOIN videos v ON vs.video_id = v.id
      ORDER BY s.name ASC
    `, [], isSource ? dbSources : dbYTP);
  };

  window.getChannelsList = (isSource, dbYTP, dbSources) => {
    return queryDB("SELECT DISTINCT channel_name FROM videos WHERE channel_name IS NOT NULL AND channel_name != '' ORDER BY channel_name ASC", [], isSource ? dbSources : dbYTP);
  };

  window.getYearsList = (isSource, dbYTP, dbSources) => {
    return queryDB("SELECT DISTINCT substr(publish_date, 1, 4) as y FROM videos WHERE publish_date IS NOT NULL ORDER BY y ASC", [], isSource ? dbSources : dbYTP);
  };

  window.getYearStats = (maxYear, db) => {
    return queryDB(`
      SELECT 
        substr(publish_date, 1, 4) as year, 
        COUNT(*) as videoCount, 
        SUM(view_count) as totalViews, 
        SUM(like_count) as totalLikes
      FROM videos 
      WHERE publish_date IS NOT NULL AND CAST(substr(publish_date, 1, 4) AS INTEGER) <= ?
      GROUP BY year 
    `, [maxYear], db);
  };

  window.searchVideosByTitle = (query, db) => {
    return queryDB("SELECT title as text FROM videos WHERE title LIKE ? LIMIT 10", [`%${query}%`], db);
  };

})();
