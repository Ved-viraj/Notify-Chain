import { getDatabase } from '../database/database';
import logger from '../utils/logger';
import { buildPaginationMetadata, normalizePaginationParams } from '../utils/pagination';

export interface NotificationHistoryRecord {
  id: number;
  scheduledNotificationId: number;
  executionAttempt: number;
  executionTime: string;
  status: 'SUCCESS' | 'FAILED' | 'RETRY';
  errorMessage: string | null;
  responseDuration: number | null;
}

export interface HistoryQueryOptions {
  limit?: number;
  offset?: number;
  status?: 'SUCCESS' | 'FAILED' | 'RETRY';
  startDate?: string;
  endDate?: string;
}

export interface PaginatedHistoryResponse {
  records: NotificationHistoryRecord[];
  total: number;
  limit: number;
  offset: number;
  itemCount: number;
  totalPages: number;
}

export class NotificationHistoryService {
  private db = getDatabase();

  async getHistory(options: HistoryQueryOptions): Promise<PaginatedHistoryResponse> {
    const { limit, offset } = normalizePaginationParams(options.limit, options.offset);

    try {
      // Build WHERE clause
      const conditions: string[] = [];
      const params: any[] = [];

      if (options.status) {
        conditions.push('status = ?');
        params.push(options.status);
      }

      if (options.startDate) {
        conditions.push('execution_time >= ?');
        params.push(options.startDate);
      }

      if (options.endDate) {
        conditions.push('execution_time <= ?');
        params.push(options.endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countSql = `SELECT COUNT(*) as count FROM notification_execution_log ${whereClause}`;
      const countResult = await this.db.get<{ count: number }>(countSql, params);
      const total = countResult?.count || 0;

      // Get paginated records
      const sql = `
        SELECT 
          id,
          scheduled_notification_id as scheduledNotificationId,
          execution_attempt as executionAttempt,
          execution_time as executionTime,
          status,
          error_message as errorMessage,
          duration_ms as responseDuration
        FROM notification_execution_log
        ${whereClause}
        ORDER BY execution_time DESC
        LIMIT ? OFFSET ?
      `;

      const records = await this.db.all<NotificationHistoryRecord>(
        sql,
        [...params, limit, offset]
      );

      logger.info('Notification history retrieved', {
        total,
        returned: records.length,
        limit,
        offset,
      });

      const pagination = buildPaginationMetadata(total, limit, offset);

      return {
        records,
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        itemCount: pagination.itemCount,
        totalPages: pagination.totalPages,
      };
    } catch (error) {
      logger.error('Failed to retrieve notification history', { error });
      throw error;
    }
  }
}