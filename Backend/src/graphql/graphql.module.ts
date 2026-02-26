import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthModule } from '../auth/auth.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { UserResolver } from './resolvers/user.resolver';
import { MarketDataResolver } from './resolvers/market-data.resolver';
import { WorkflowResolver } from './resolvers/workflow.resolver';
import { DateScalar } from './scalars/date.scalar';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/graphql/schema.gql'),
      sortSchema: true,
      playground: true,
      subscriptions: {
        'graphql-ws': true,
        'subscriptions-transport-ws': true,
      },
      context: ({ req, connection }) => {
        if (connection) {
          return { req: connection.context };
        }
        return { req };
      },
      resolvers: { JSONObject: GraphQLJSONObject },
    }),
    AuthModule,
    MarketDataModule,
    WorkflowModule,
  ],
  providers: [
    UserResolver,
    MarketDataResolver,
    WorkflowResolver,
    DateScalar,
  ],
})
export class GraphqlModule {}
