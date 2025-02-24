import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  IndexTable,
  useBreakpoints,
  Button,
  Pagination,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import PrintModal from "../utils/printModal";

async function fetchOrders(admin, cursor = null) {
  const query = `
    query getOrders($cursor: String) {
      orders(first: 250, after: $cursor, sortKey: CREATED_AT, reverse: true) {
        nodes {
          name
          id
          createdAt
          customer {
            displayName
          }
          displayFinancialStatus
          displayFulfillmentStatus
          lineItems(first: 100) {
            edges {
              node {
                title
                quantity
                originalUnitPriceSet {
                  presentmentMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet { 
            presentmentMoney { 
              amount 
              currencyCode 
            } 
          }
          totalTaxSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  
  const response = await admin.graphql(
    query,
    {
      variables: {
        cursor: cursor
      }
    }
  );
  return response.json();
}

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const currentPage = parseInt(url.searchParams.get("page")) || 1;
    const pageSize = 250;

    if (!admin) {
      console.log('인증 상태:', admin); // 디버깅용 로그 추가
      throw new Error('Admin authentication failed');
    }

    let orders = [];
    let hasNextPage = true;
    let cursor = null;
    let totalOrders = 0;

    while (hasNextPage) {
      const data = await fetchOrders(admin, cursor);
      if (!data) {
        throw new Error('Failed to fetch orders from Shopify');
      }

      const newOrders = data.data.orders.nodes;
      totalOrders += newOrders.length;
      orders = [...orders, ...newOrders];

      hasNextPage = data.data.orders.pageInfo.hasNextPage;
      cursor = data.data.orders.pageInfo.endCursor;

      console.log('페이지네이션 상태:', {
        현재페이지: currentPage,
        총주문수: totalOrders,
        페이지당주문수: pageSize,
        다음페이지존재: hasNextPage,
        현재커서: cursor
      });

      if (totalOrders >= currentPage * pageSize) {
        break;
      }
    }

    const formattedOrders = orders.map(node => ({
      id: node.name,
      order: node.id,
      displayName: node.customer?.displayName || '顧客情報無し',
      totalPrice: formatCurrency(parseFloat(node.totalPriceSet.presentmentMoney.amount)),
      subtotalPrice: formatCurrency(parseFloat(node.subtotalPriceSet.presentmentMoney.amount)),
      totalTax: formatCurrency(parseFloat(node.totalTaxSet.presentmentMoney.amount)),
      displayFinancialStatus: node.displayFinancialStatus,
      displayFulfillmentStatus: node.displayFulfillmentStatus,
      createdAt: node.createdAt.split('T')[0],
      items: node.lineItems.edges,
    }))
    .sort((a, b) => b.id.localeCompare(a.id));

    return json({
      orders: formattedOrders,
      pagination: {
        currentPage,
        totalItems: totalOrders,
        pageSize,
        hasNextPage: hasNextPage && totalOrders >= currentPage * pageSize,
        totalPages: Math.ceil(totalOrders / pageSize)
      }
    });
  } catch (error) {
    console.error('app._index Loader Error : ', error);
    return json({ error: 'Failed to fetch orders.' }, { status: 500 });
  }
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
};

export default function Index() {
  const { orders, pagination } = useLoaderData();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const navigate = useNavigate();

  const handlePageChange = (newPage) => {
    navigate(`?page=${newPage}`);
  };

  const resourceName = {
    singular: 'order',
    plural: 'orders',
  };

  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {order.id}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.createdAt}</IndexTable.Cell>
        <IndexTable.Cell>{order.displayName}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span">
            {order.totalPrice}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.displayFinancialStatus}</IndexTable.Cell>
        <IndexTable.Cell>{order.displayFulfillmentStatus}</IndexTable.Cell>
        <IndexTable.Cell>
        <Button onClick={() => setSelectedOrder(order)}>領収書</Button>
        </IndexTable.Cell>
      </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <IndexTable
              condensed={useBreakpoints().smDown}
              resourceName={resourceName}
              itemCount={orders.length}
              headings={[
                {title: '注文'},
                {title: '日付'},
                {title: 'お客様（請求先／配送先）'},
                {title: '合計'},
                {title: '支払い'},
                {title: 'フルフィルメント'},
                {title: ''},
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
              <Pagination
                label={`${pagination.currentPage} / ${pagination.totalPages} 페이지`}
                hasPrevious={pagination.currentPage > 1}
                hasNext={pagination.currentPage < pagination.totalPages}
                onPrevious={() => handlePageChange(pagination.currentPage - 1)}
                onNext={() => handlePageChange(pagination.currentPage + 1)}
              />
            </div>
          </Card>
        </Layout.Section>
      </Layout>
      {selectedOrder && (
        <PrintModal
          order={selectedOrder}
          open={() => setSelectedOrder(null)}
        />
      )}
    </Page>
  );
}