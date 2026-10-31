package com.campusradar.catalog;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface PublicStatsMapper {
    @Select("SELECT COUNT(*) FROM companies") long companies();
    @Select("SELECT COUNT(*) FROM jobs j JOIN sources s ON s.id = j.source_id WHERE j.publication_status = 'PUBLISHED' AND j.status = 'OPEN' AND s.enabled = 1") long openJobs();
    @Select("SELECT COUNT(*) FROM experiences WHERE status = 'PUBLISHED'") long experiences();
    @Select("SELECT COUNT(*) FROM questions WHERE status = 'PUBLISHED'") long questions();
}
