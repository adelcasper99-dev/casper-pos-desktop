const { PrismaClient, Prisma } = require('@prisma/client');
const client = new PrismaClient();
const ext = client.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        console.log(`Intercepted ${operation} on ${model}`);
        if (operation === 'findUnique') {
           const camelModel = model.charAt(0).toLowerCase() + model.slice(1);
           console.log('Client has camelModel?', !!client[camelModel]);
           console.log('Client camelModel has findFirst?', !!client[camelModel]?.findFirst);
           return client[camelModel].findFirst(args);
        }
        return query(args);
      }
    }
  }
});
ext.user.findUnique({ where: { id: "1" } }).catch(e=>console.log(e.message));
