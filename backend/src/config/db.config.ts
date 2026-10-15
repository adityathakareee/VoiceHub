import mongoose from 'mongoose';
import { envConfig } from './env.config';
import { logger } from '../utils/logger';

export enum DbStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
}

class DatabaseService {
  private status: DbStatus = DbStatus.DISCONNECTED;

  public async connect(): Promise<void> {
    this.status = DbStatus.CONNECTING;
    logger.info('Connecting to MongoDB...');

    mongoose.connection.on('connected', () => {
      this.status = DbStatus.CONNECTED;
      logger.info('MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      this.status = DbStatus.DISCONNECTED;
      logger.error('MongoDB connection error occurred:', err);
    });

    mongoose.connection.on('disconnected', () => {
      this.status = DbStatus.DISCONNECTED;
      logger.warn('MongoDB connection lost/disconnected');
    });

    try {
      await mongoose.connect(envConfig.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      this.status = DbStatus.CONNECTED;
    } catch (error) {
      this.status = DbStatus.DISCONNECTED;
      logger.error('Initial MongoDB connection failed. Running in degraded state mode.', error);
    }
  }

  public getStatus(): DbStatus {
    if (mongoose.connection.readyState === 1) {
      return DbStatus.CONNECTED;
    }
    return this.status;
  }

  public async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      logger.info('Closing MongoDB database connection gracefully...');
      await mongoose.disconnect();
      this.status = DbStatus.DISCONNECTED;
      logger.info('MongoDB database connection closed');
    }
  }
}

export const dbService = new DatabaseService();
