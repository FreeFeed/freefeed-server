import { DocumentsController } from '../../../controllers';

export default function addRoutes(app) {
  const controller = new DocumentsController(app);

  app.get('/documents', controller.list);
  app.post('/documents', controller.create);
  app.get('/documents/tree', controller.tree);
  app.get('/documents/:docId', controller.getById);
  app.put('/documents/:docId', controller.update);
  app.delete('/documents/:docId', controller.destroy);
  app.get('/public/documents/:slug', controller.getByUserAndSlug);
}
